import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, workspaceSnapshotsTable } from "@workspace/db";
import { UpdateWorkspaceBody } from "@workspace/api-zod";

const router: IRouter = Router();
const WORKSPACE_ID = "vertex-demo";

const DEFAULT_WORKSPACE = {
  owner: "Seif Alden",
  metrics: {
    monthlyRevenue: 184620,
    cashPosition: 326480,
    activeCustomers: 24,
    openProjects: 8,
    cashRunwayMonths: 4.7,
    monthlyBurn: 69460,
    dueNext14Days: 42800,
  },
  customers: [
    { id: "c1", name: "ريم العتيبي", company: "Namaa Health", sector: "Healthcare", health: "On track", owner: "Seif Alden", lastActivity: "12 min ago", value: 128400, initials: "رع", color: "bg-[#d8ede7] text-[#27695f]" },
    { id: "c2", name: "Omar Haddad", company: "Northstar Logistics", sector: "Logistics", health: "On track", owner: "Yousef K.", lastActivity: "1 hr ago", value: 94200, initials: "OH", color: "bg-[#f8dfc7] text-[#a65d2e]" },
    { id: "c3", name: "سارة منصور", company: "Atelier 11", sector: "Real estate", health: "Needs attention", owner: "Seif Alden", lastActivity: "Yesterday", value: 67200, initials: "سم", color: "bg-[#e3dff1] text-[#665391]" },
    { id: "c4", name: "Lina Haddad", company: "Sahab Foods", sector: "Consumer", health: "At risk", owner: "Amal F.", lastActivity: "2 days ago", value: 45800, initials: "LH", color: "bg-[#f3dbdf] text-[#a14d61]" },
    { id: "c5", name: "عبدالله الحربي", company: "Razan Capital", sector: "Finance", health: "On track", owner: "Yousef K.", lastActivity: "3 days ago", value: 211600, initials: "عح", color: "bg-[#d9e7f1] text-[#386b8b]" },
    { id: "c6", name: "Hana Park", company: "Mizan Studio", sector: "Creative", health: "On track", owner: "Amal F.", lastActivity: "4 days ago", value: 32900, initials: "HP", color: "bg-[#eee4cd] text-[#87692d]" },
  ],
  projects: [
    { id: "p1", name: "Q3 Brand Architecture", client: "Namaa Health", status: "In progress", progress: 68, dueDate: "Aug 28", owner: "Seif Alden", tasks: "17 / 25" },
    { id: "p2", name: "Fleet Intelligence Portal", client: "Northstar Logistics", status: "Review", progress: 91, dueDate: "Aug 22", owner: "Yousef K.", tasks: "29 / 32" },
    { id: "p3", name: "Riyadh HQ Fit-out", client: "Atelier 11", status: "Planning", progress: 14, dueDate: "Sep 16", owner: "Amal F.", tasks: "4 / 28" },
    { id: "p4", name: "Investor Data Room", client: "Razan Capital", status: "Complete", progress: 100, dueDate: "Aug 08", owner: "Yousef K.", tasks: "18 / 18" },
    { id: "p5", name: "Summer Menu Launch", client: "Sahab Foods", status: "In progress", progress: 42, dueDate: "Sep 03", owner: "Amal F.", tasks: "11 / 26" },
    { id: "p6", name: "Mizan identity refresh", client: "Mizan Studio", status: "Planning", progress: 8, dueDate: "Oct 01", owner: "Seif Alden", tasks: "2 / 24" },
  ],
  invoices: [
    { id: "i1", number: "INV-2024-081", client: "Namaa Health", amount: 42800, currency: "SAR", status: "Due soon", dueDate: "Aug 18, 2024" },
    { id: "i2", number: "INV-2024-079", client: "Northstar Logistics", amount: 28900, currency: "SAR", status: "Paid", dueDate: "Aug 12, 2024" },
    { id: "i3", number: "INV-2024-076", client: "Sahab Foods", amount: 11400, currency: "SAR", status: "Overdue", dueDate: "Aug 05, 2024" },
    { id: "i4", number: "INV-2024-084", client: "Razan Capital", amount: 63200, currency: "SAR", status: "Draft", dueDate: "Sep 02, 2024" },
    { id: "i5", number: "INV-2024-074", client: "Atelier 11", amount: 22500, currency: "SAR", status: "Paid", dueDate: "Jul 28, 2024" },
    { id: "i6", number: "INV-2024-071", client: "Mizan Studio", amount: 8600, currency: "SAR", status: "Paid", dueDate: "Jul 23, 2024" },
  ],
  activities: [
    { id: "a1", actor: "Seif Alden", action: "sent an invoice to", target: "Namaa Health · INV-2024-081", time: "12 min ago", type: "invoice", initials: "SA" },
    { id: "a2", actor: "Yousef K.", action: "moved project to review", target: "Fleet Intelligence Portal", time: "1 hr ago", type: "project", initials: "YK" },
    { id: "a3", actor: "Amal F.", action: "added a note to", target: "Sahab Foods", time: "3 hrs ago", type: "customer", initials: "AF" },
    { id: "a4", actor: "Seif Alden", action: "completed task in", target: "Q3 Brand Architecture", time: "Yesterday", type: "project", initials: "SA" },
    { id: "a5", actor: "System", action: "connected bank account", target: "Riyad Bank · •••• 1492", time: "Yesterday", type: "system", initials: "VX" },
    { id: "a6", actor: "Yousef K.", action: "marked invoice as paid", target: "Northstar Logistics · INV-2024-079", time: "2 days ago", type: "invoice", initials: "YK" },
  ],
} as const;

function responseFor(data: typeof DEFAULT_WORKSPACE, updatedAt: Date) {
  return { workspaceId: WORKSPACE_ID, ...data, updatedAt: updatedAt.toISOString() };
}

router.get("/workspace", async (req, res) => {
  try {
    let [record] = await db.select().from(workspaceSnapshotsTable).where(eq(workspaceSnapshotsTable.workspaceId, WORKSPACE_ID)).limit(1);
    if (!record) {
      [record] = await db.insert(workspaceSnapshotsTable).values({
        workspaceId: WORKSPACE_ID,
        owner: DEFAULT_WORKSPACE.owner,
        data: DEFAULT_WORKSPACE,
      }).returning();
    }
    res.json(responseFor(record.data as typeof DEFAULT_WORKSPACE, record.updatedAt));
  } catch (error) {
    req.log.error({ err: error }, "Workspace read failed");
    res.status(503).json({ error: "Workspace data is temporarily unavailable." });
  }
});

router.put("/workspace", async (req, res) => {
  const parsed = UpdateWorkspaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid workspace snapshot." });
    return;
  }

  try {
    const [record] = await db.insert(workspaceSnapshotsTable).values({
      workspaceId: WORKSPACE_ID,
      owner: parsed.data.owner,
      data: parsed.data,
    }).onConflictDoUpdate({
      target: workspaceSnapshotsTable.workspaceId,
      set: { owner: parsed.data.owner, data: parsed.data, updatedAt: new Date() },
    }).returning();
    res.json(responseFor(record.data as typeof DEFAULT_WORKSPACE, record.updatedAt));
  } catch (error) {
    req.log.error({ err: error }, "Workspace write failed");
    res.status(503).json({ error: "Workspace data could not be saved." });
  }
});

export default router;