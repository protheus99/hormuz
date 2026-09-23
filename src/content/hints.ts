// What the weather sounds like before it breaks (spec §12A.6). As a company's hidden record grows,
// and as trouble raises the odds of it coming due, the world says so — in letters, visits and
// questions, never in numbers. A player should come to feel the pressure without ever being told
// the forecast, so nothing here counts anything, names a total or gives a date.
//
// Four rungs, and they are meant to read as four different kinds of day: routine paperwork, someone
// taking a closer look, people talking about you, and a file with your name on it.

export interface HintLine {
  readonly id: string;
  readonly headline: string;
  readonly body: string;
}

export type Rung = 0 | 1 | 2 | 3 | 4;

/** What each rung feels like, for the log and for anything that wants to say where you stand. */
export const RUNG_WORDS: Readonly<Record<Rung, string>> = {
  0: 'nothing in the post',
  1: 'questions in the post',
  2: 'somebody taking a closer look',
  3: 'people being asked about you',
  4: 'a file with your name on it',
};

export const HINTS: Readonly<Record<Exclude<Rung, 0>, readonly HintLine[]>> = {
  1: [
    {
      id: 'h1-records',
      headline: 'Your insurer has asked for maintenance records',
      body: 'A clerk’s letter, politely worded, asking for three years of them. Renewal is some way off yet.',
    },
    {
      id: 'h1-flaring',
      headline: 'The regulator has asked for your flaring returns',
      body: 'Since the start of last year, it says, and it would like them in the original form rather than a summary.',
    },
    {
      id: 'h1-audit',
      headline: 'A partner’s auditors want another week on site',
      body: 'Nothing is said about why. They have booked the rooms already.',
    },
  ],
  2: [
    {
      id: 'h2-visit',
      headline: 'An inspector called at a lease without an appointment',
      body: 'He walked the site, asked the foreman two questions, and left without saying what he was looking for.',
    },
    {
      id: 'h2-engineer',
      headline: 'Your insurer wants to send its own engineer round',
      body: 'At its expense, which is not how insurers usually spend money.',
    },
    {
      id: 'h2-again',
      headline: 'The regional office has asked for the same returns again',
      body: 'In more detail this time, and addressed to you rather than to the office.',
    },
  ],
  3: [
    {
      id: 'h3-journalist',
      headline: 'A journalist has been ringing people who used to work for you',
      body: 'Two of them called to let you know. Neither would say much about what was asked.',
    },
    {
      id: 'h3-statement',
      headline: 'A former contractor has been asked for a statement',
      body: 'He rang your office before he gave it, which is more courtesy than you were owed.',
    },
    {
      id: 'h3-banker',
      headline: 'Your banker asked a question he already knew the answer to',
      body: 'Twice, in different words, and wrote the second answer down.',
    },
  ],
  4: [
    {
      id: 'h4-file',
      headline: 'A file has been opened',
      body: 'Your counsel says so plainly, and expects you to be served within the month. There is no longer any point in tidying up quietly.',
    },
    {
      id: 'h4-agenda',
      headline: 'The ministry’s committee has your company on its agenda',
      body: 'Nobody will say under which heading. The meeting is not far off.',
    },
    {
      id: 'h4-legal',
      headline: 'The papers have gone to the regulator’s legal team',
      body: 'That is the last stage before somebody decides what to take.',
    },
  ],
};

/** What a reckoning reads like when it lands. Plain, and it names the thing that was taken. */
export function reckoningText(severity: string, what: string, cost: string): { readonly headline: string; readonly body: string } {
  switch (severity) {
    case 'FORFEIT':
      return {
        headline: `${what} has been taken back`,
        body: `The licence to work it is cancelled and the oil under it goes with the ground. A settlement of ${cost} is payable on top.`,
      };
    case 'SHUT':
      return {
        headline: `${what} has been ordered shut`,
        body: `Nothing comes out of it until the order is lifted, and a settlement of ${cost} is payable.`,
      };
    case 'REVOKE':
      return {
        headline: `Your licence for ${what} has been revoked`,
        body: `You may not bid there or work there, and there is no second application. A settlement of ${cost} is payable.`,
      };
    case 'WITHDRAW':
      return {
        headline: 'Your credit line has been withdrawn',
        body: `The bank has closed the facility outright. A settlement of ${cost} is payable, from cash.`,
      };
    default:
      return { headline: 'A penalty has been imposed', body: `${cost}, payable at once, and the matter is closed.` };
  }
}
