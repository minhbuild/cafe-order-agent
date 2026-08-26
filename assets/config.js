/* ------------------------------------------------------------------
   Paste the Apps Script Web App /exec URL here (see apps-script/Code.gs).
   Both the order form and the ticket board read it from this one place.

   Leave it empty to run the order form without writing to a sheet; the
   board then falls back to whatever is cached in this browser.
------------------------------------------------------------------ */
const SHEET_ENDPOINT = "https://script.google.com/macros/s/AKfycbxpMcBs6LKxIIJHwEvSgQBgg5YpumZNzj0wnWidhnvDRjKV9yYcFK1iEZSih0mG4PTF/exec";

/* How often the ticket board re-reads the sheet, in milliseconds. */
const BOARD_POLL_MS = 4000;
