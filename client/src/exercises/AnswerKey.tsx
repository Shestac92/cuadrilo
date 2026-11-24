import { t } from '../i18n';

/** The right answer(s) of a gap as one line: "soy / es" for alternatives. */
export const keyText = (answers: string[]) => answers.join(' / ');

/** The teacher's view: the right answer in grey, after an answer that is wrong or cannot show it itself. */
export function AnswerKey({ answers }: { answers: string[] }) {
  return (
    <span className="gap-key" title={t('viewMode.rightAnswer')}>
      {keyText(answers)}
    </span>
  );
}
