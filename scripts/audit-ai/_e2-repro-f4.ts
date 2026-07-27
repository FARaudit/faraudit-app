const CIT = '[citation withheld — "215-2" is not a valid DFARS designation and does not appear in the solicitation]';
console.log('marker:', JSON.stringify(CIT.slice(0, 40)));
console.log('/§([A-M])\\b/ →', CIT.match(/§([A-M])\b/));
console.log('/\\b([A-M])\\b/i →', CIT.match(/\b([A-M])\b/i));
console.log('/[A-M]\\b/i →', CIT.match(/[A-M]\b/i));
