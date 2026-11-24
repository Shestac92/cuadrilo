# Privacy Policy

*Last updated: 2 November 2026*

This policy explains what personal data is processed when you use {{platformName}} ("the platform"), why, and what rights you have. It is written to meet the EU/UK GDPR and, as far as possible, other data protection laws.

## 1. Who is responsible for your data

The **teacher** who gave you an account is the **data controller**: they decide why and how your data is used, and they are the person you contact about it.

- Controller: {{teacherName}}
- Contact: {{teacherContact}}

The platform is software the teacher uses to give lessons. {{hostName}} hosts it on the teacher's behalf in {{hostingCountry}} and processes data only to run it (a data processor). It does not use the data for its own purposes.

## 2. What data is processed

The platform is built to collect as little as possible. We do **not** ask for your name, e-mail address, phone number, date of birth, address or payment details.

| Data | Details |
|---|---|
| Account | A username and a password chosen and handed out by the teacher. The password is stored only as a one-way hash. |
| Your work | Answers to exercises (including texts you write), homework and its status, words you save to your vocabulary, the lesson and chapter where you stopped. |
| Teacher's feedback | Comments and highlights the teacher adds to your answers. |
| Lessons | Which lessons you have access to and when it was granted, the groups you belong to. |
| Online classes | Which classes you were part of, when you joined, the lesson and chapter you are viewing during a class (shown live to the teacher), lines written on the class board. |
| Technical | A session cookie (see section 5). Your IP address is used briefly, in memory only, to limit repeated failed sign-in attempts. |

**Please do not put personal information in your username or in free-text fields** (answers, board, comments) unless it is part of the exercise. Anything you write there is stored as you wrote it.

## 3. Why we use it and on what legal basis

| Purpose | Legal basis (GDPR) |
|---|---|
| Give you an account and let you take lessons, do homework and receive feedback | Performance of the teaching agreement with you or your parent or guardian (Art. 6(1)(b)) |
| Keep the platform secure (sessions, limiting failed sign-ins) | Legitimate interest (Art. 6(1)(f)) |
| Load third-party content (section 6) | Your consent, given by pressing the button that loads it (Art. 6(1)(a)) |
| Students below the digital age of consent | The consent of a parent or guardian, collected by the teacher (Art. 8) |

We do not sell your data, show advertising, build profiles, or take automated decisions about you.

## 4. Children

Students may be minors. Before a minor receives an account, the teacher obtains the consent of their parent or guardian. Parents and guardians can exercise all the rights below on the child's behalf by contacting the teacher.

## 5. Cookies and local storage

The platform uses only what is strictly necessary, so no cookie banner is shown.

| Name | Where | Purpose | Duration |
|---|---|---|---|
| `app_session` | Cookie (HttpOnly, SameSite=Lax, Secure) | Keeps you signed in | Up to 30 days, or until you sign out |
| `mantine-color-scheme-value` | Local storage | Remembers light or dark theme | Until you clear your browser data |
| Last class notice | Session storage | Avoids showing the same class notice twice | Until you close the tab |

We use no analytics, advertising or tracking cookies.

## 6. Third-party content

A teacher may add content from other services to a lesson. It is never loaded until you press a button, and loading it sends your IP address and browser details to that service, which may also set its own cookies under its own policy:

- **YouTube** (privacy-enhanced mode, `youtube-nocookie.com`): loads when you press play.
- **Genially** (`view.genially.com`): loads when you press "Load the exercise". What you do inside a Genially is handled by Genially, not saved by the platform.

If you do not press the button, nothing is sent.

## 7. Who receives your data, and transfers

- The teacher (controller) sees everything described in section 2 about their own students.
- The hosting provider processes data on the teacher's behalf in {{hostingCountry}}. {{transferNote}}
- Teachers may connect an AI assistant to manage lesson content. It receives lessons and media, **not** student accounts, answers or other student data.
- Data is disclosed to authorities only where the law requires it.

## 8. How long we keep it

Data is kept **for at least one year**. After that, the teacher decides whether to keep or delete it. The platform does not delete data automatically. Session records expire after 30 days. Deleted data may remain in backups until the backups are rotated out.

## 9. Your rights

You have the right to access your data, have it corrected, have it erased, receive a copy in a portable format, restrict or object to its use, withdraw consent at any time (without affecting earlier processing), and complain to your data protection authority.

**How:** contact the teacher ({{teacherContact}}). The teacher can download a file with all your data and can delete your account together with all its data permanently, directly in the platform. You will get an answer within one month.

Residents of California and other US states: we do not sell or share personal information for advertising, and we use it only to provide the service.

## 10. Security

Passwords and sign-in tokens are stored only as hashes. Connections use HTTPS. The session cookie cannot be read by scripts on the page. Student data is available only to the student concerned and to the teachers of this installation.

## 11. Changes and contact

If this policy changes, the new version is published here with a new date. Questions: {{teacherContact}}.

---

### Notes for the operator (not part of the published text)

- Placeholders are filled from `.env` when the client is built: `PLATFORM_NAME` is set separately (see `.env.example`); `CONTROLLER_NAME`, `CONTROLLER_CONTACT`, `HOST_NAME`, `HOSTING_COUNTRY`, `TRANSFER_NOTE` (for example "Data does not leave {{hostingCountry}}", or the safeguard used, such as standard contractual clauses). A build warns about placeholders left empty. The date at the top is edited by hand when the text changes.
- This text was prepared from what the code does. It is not legal advice: have it reviewed before using it in a given country.
