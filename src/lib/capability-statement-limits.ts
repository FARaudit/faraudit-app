// ONE CAP FOR ONE DOCUMENT.
//
// The capability statement is printed in three places — the page, the PDF, and the
// formatted copy pasted into Word — and each used to carry its own row limit. The page
// showed 20 past-performance rows and the PDF printed 12, so a customer who read their
// statement on screen and then sent the PDF sent a shorter document than the one they
// checked, with no indication that anything had been dropped.
//
// The cap itself is deliberate: a capability statement is read in one sitting and an
// unbounded list stops being a summary. What was wrong was that it was silent, and that
// it was not the same number twice. Anything that renders past performance imports this.
export const PAST_PERFORMANCE_LIMIT = 20;

// THE DOCUMENT IS NOT THE RECORD.
//
// A capability statement is a one-page document. The convention taught by the APEX
// Accelerator network and echoed by every template in circulation is three to five
// past-performance entries — customer, contract number, period of performance, value,
// one line of scope — chosen for relevance, because a contracting officer doing market
// research is scanning dozens of these and a twenty-row list stops being a summary.
//
// So the page shows the whole record (up to PAST_PERFORMANCE_LIMIT) because the page is
// where the customer works, and the exported document carries the five most recent
// because that is what gets sent. Both say which they are showing and out of how many;
// neither silently drops a row.
export const PAST_PERFORMANCE_EXPORT_LIMIT = 5;
