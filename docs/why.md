# Why Cuadrilo exists

## The problem

An independent language teacher usually teaches with tools stitched together: a video call for the lesson, a messenger for homework, a shared document for texts, a form for exercises, a drive folder for audio. The answers end up in five places, the teacher cannot see what the student is doing right now, and every new tool asks the student for another account.

Big learning-management systems are built for schools: heavy to install and to learn. Hosted course platforms are easier, but the teacher rents a place on someone else's service, and the students' data lives there too.

## What Cuadrilo does differently

- **A workshop for lessons, not a catalogue of courses.** A lesson is made of small blocks (gaps, matching, sorting, tests, dictation, word search, pictures, audio, video) that check themselves when the student answers.
- **Made for the live lesson, for one student or a group.** See answers arrive, show the next chapter, spin a wheel of questions, write on a shared board, give an exercise as homework without leaving the page.
- **Small and private.** One teacher, their own students. The platform knows only a login and a password per student. No catalogue, no ads, no analytics. It runs on a small server you own, and the data is one folder.
- **AI where it saves time.** A built-in MCP server lets Claude or ChatGPT turn a worksheet into a lesson; the teacher checks it. The assistant cannot see the students' answers.
- **Open.** MIT-licensed: install it, change it, keep your copy.

## Who it is for

- an independent teacher or a small school teaching a language;
- a tutor who prepares material often and wants an assistant to do the typing;
- a developer who wants a base for a teaching tool.

## Who it is not for

- a marketplace or a way to find students: Cuadrilo is closed on purpose;
- a large school that needs timetables, grades, reports and many administrators;
- anyone who wants a hosted service with nothing to install: this is something you run yourself (the [guide](../deploy/INSTALL.md) is written for non-administrators, but it is still a server).

## How it started

I started this as a student. My teacher used a paid platform that was full of bugs, worked badly, and once went down for several days. I thought: I can make my own, better and faster, and free for the teacher and the students. The paid platforms I looked at did not even have an MCP server for editing lessons, so everything was done by hand.

A platform like this should belong to the teacher: on their own server they do not depend on someone else's decisions. And basic tools for teachers should not need a subscription.

## Where it is going

I hope to collect feedback from real use and develop Cuadrilo from it. Ideas and bug reports are welcome ([Contributing](../README.md#contributing)).

The core stays a lesson engine with as little around it as possible. It will not grow into a large LMS with mail, calls and calendars. If such an LMS is ever worth building, it will be a separate project on the same engine.

A coffee helps: [buymeacoffee.com/shestac92](https://buymeacoffee.com/shestac92).
