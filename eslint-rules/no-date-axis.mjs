// D-8: days are strings on a calendar axis. Every one of these is a silent axis-crossing
// through the process timezone, and in a drip-release engine a one-day shift unlocks an
// item a day early. Ported from bookable-appointment-service `eslint-rules/no-axis-crossing.mjs`
// (public repo, read 2026-10-25); Coursework has no instant axis at all, so there is no
// sanctioned boundary module and no exemption inside clone-owned code. Template-owned and
// template-authored paths are excluded in eslint.config.mjs because a clone never edits them.
export const noDateAxisRules = {
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date'][arguments.length>0]",
      message: 'new Date(string) crosses the calendar axis through the process timezone (D-8). Days are YYYY-MM-DD strings; use src/graph/days.ts.',
    },
    {
      selector: "CallExpression[callee.object.name='Date'][callee.property.name='parse']",
      message: 'Date.parse crosses the calendar axis through the process timezone (D-8). Use src/graph/days.ts.',
    },
    {
      selector: "CallExpression[callee.property.name=/^(get|set)(UTC)?(Hours|Minutes|Seconds|Milliseconds|Date|Month|FullYear|Day)$/]",
      message: 'Date get/set accessors read or write through the process timezone (D-8). Use src/graph/days.ts.',
    },
    {
      selector: "CallExpression[callee.property.name='getTimezoneOffset']",
      message: 'getTimezoneOffset reads the process timezone directly (D-8).',
    },
    {
      selector: "CallExpression[callee.property.name='slice'][callee.object.callee.property.name='toISOString']",
      message: 'toISOString().slice(0,10) derives a calendar day from an instant through the process timezone (D-8). Use src/graph/days.ts.',
    },
  ],
};
