// The suites test repeating events everywhere: the recurrence entry plugged in once (owner, 18i — an application
// imports '@dzcalendar/core/recurrence' itself; packages/core/test/recurrence-entry.test.ts checks the calendar without it).
import '@dzcalendar/core/recurrence';
