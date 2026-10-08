-- Analytics aggregations filter won/lost deals and overdue tasks by organization + timestamp.
CREATE INDEX "deals_organization_id_won_at_idx" ON "deals"("organization_id", "won_at");
CREATE INDEX "deals_organization_id_lost_at_idx" ON "deals"("organization_id", "lost_at");
CREATE INDEX "tasks_organization_id_status_due_date_idx" ON "tasks"("organization_id", "status", "due_date");
