# Behaviour sheet — an all-day background event in a time grid

What an application does: gives an event `allDay: true, display:
'background'` — a closed day, leave, a public holiday — and shows a week or
a day. What a person observes in the other library: the day's column is
tinted from top to bottom, at every hour, as well as its all-day row; a
closed day is seen wherever the eye reads the day.

What DzCalendar does: the same. An all-day background event tints its days'
columns over the whole time grid (every hour shown, whatever the grid's
first and last hour) and its cells of the all-day row. It is drawn under the
events, takes no pointer (a slot under it is still clicked, selected, dropped
on — the rules, not the tint, refuse), and carries the event's tone and
classes. A tint is not read by assistive technology; a label the content
hook gives it (`ctx.background`) is drawn at the top of each column it covers
and read there. With `allDaySlot: false` the column is still tinted.

Where we differ: nothing on purpose. Written in our own words from what the
other library shows.
