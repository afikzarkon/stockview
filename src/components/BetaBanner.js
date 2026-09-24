import React from 'react';

// The standing "this is a test system" strip.
//
// Deliberately a separate component from BetaNoticeModal rather than a
// prop on it: the modal is an interruption shown once per visit and then
// dismissed, and the thing a user needs while they are actually typing a
// balance in is a notice that is still on the page. One says it on
// arrival; this says it wherever the warning still applies.
//
// `tone` picks which half of the warning leads. The pages where money is
// entered lead with "do not put real figures in"; the tax pages lead with
// "these numbers are an estimate", because that is the claim being made on
// the screen the banner is sitting on. The rest get the general one.
const MESSAGES = {
  general: {
    title: 'המערכת בשלב בדיקות (Beta)',
    body:
      'זוהי גרסת ניסיון שאינה מאובטחת סייבר ומיועדת לבדיקות בלבד. אין להזין נתונים פיננסיים אמיתיים או פרטים מזהים.'
  },
  data: {
    title: 'המערכת בשלב בדיקות (Beta) - אין להזין נתונים אמיתיים',
    body:
      'הזינו נתוני דמה בלבד. המערכת אינה מאובטחת סייבר ואינה מיועדת להחזקת מידע פיננסי אמיתי.'
  },
  tax: {
    title: 'המערכת בשלב בדיקות (Beta) - חישובי המס הם אומדן',
    body:
      'קיזוז הפסדים וחישובי המס המוצגים הם הערכה בלבד ואינם ייעוץ או חוות דעת. לפני כל פעולה התייעצו עם יועץ מס או איש מקצוע מוסמך.'
  }
};

function BetaBanner({ tone = 'general' }) {
  const message = MESSAGES[tone] || MESSAGES.general;
  return (
    <div className={`beta-banner beta-banner-${tone}`} role="note">
      <span className="beta-banner-tag">BETA</span>
      <span className="beta-banner-text">
        <strong className="beta-banner-title">{message.title}</strong>
        <span className="beta-banner-body">{message.body}</span>
      </span>
    </div>
  );
}

export default BetaBanner;
