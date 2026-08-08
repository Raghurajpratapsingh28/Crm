# Follow-ups

Activities and tasks stay separate objects. They connect through the same company, contact, or deal.

## Intended loop

1. Log an activity: “Called the customer.”
2. Optionally create a follow-up task on the same form.
3. Complete the task when the work is done.
4. Log another activity if something new happened.

The UI never auto-creates a task for every activity. The activity form exposes **Create follow-up task**. The API creates both rows in one transaction when `followUp` is present.

## Contextual create

| Page | Prefills |
| --- | --- |
| Company detail | `companyId` |
| Contact detail | `contactId` and company when present |
| Deal detail | `dealId`, company, and primary contact |

`/activities` and `/tasks` use the same forms without a forced relation.

## Timeline

`ActivityTimeline` is shared across company, contact, and deal pages. It pages 25 items, newest first, grouped as Today / Yesterday / date, and shows `Proposal → Negotiation` for status changes.

## Notifications

Assignment, upcoming reminders, overdue notices, and deal events appear in the notification bell. Clicking a task notification opens `/tasks/:id` and marks the notification read. See [NOTIFICATIONS.md](./NOTIFICATIONS.md).
