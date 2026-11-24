import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';

import { PLATFORM_NAME } from '../platform';
import { registerLessonPrompts, registerLessonTools } from './tools';

/**
 * The MCP server at /mcp: Streamable HTTP without sessions — a server for
 * each request, answering in JSON. The bearer token was checked before
 * (oauth/router.ts requireAssistantToken).
 */
function createLessonsServer(): McpServer {
  const server = new McpServer(
    { name: 'lessons', title: PLATFORM_NAME, version: '1.0.0' },
    {
      instructions: [
        "This is a language-lessons platform. These tools create and change the teacher's lessons and read their media library; you act as the teacher.",
        'Start with lesson_format: the lesson format, every block with an example, how to work and what to ask the teacher first. In short:',
        '- list_lessons first (do not make a second copy of a lesson); list_media for pictures and audio; a file from the chat cannot be uploaded, only added from a public https link (upload_media_from_url) or by the teacher on the Archivos page.',
        '- A lesson that students already see (studentsWithAccess above zero) changes for them at once: say so and ask the teacher before you change it; ask before any delete too, it removes the students’ answers.',
        '- A call that reports problems saved nothing: fix what it names and call again.',
        '- After the work, give the teacher the editor link and what you made. Students get access from the teacher, not from you.',
      ].join('\n'),
    },
  );
  registerLessonTools(server);
  registerLessonPrompts(server);
  return server;
}

export async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  const server = createLessonsServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
