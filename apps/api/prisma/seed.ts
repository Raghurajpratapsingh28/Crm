import {
  ActivityType,
  AuditAction,
  ContactSource,
  Department,
  InvoiceStatus,
  LostReason,
  MemberStatus,
  NotificationType,
  PaymentProvider,
  Plan,
  PrismaClient,
  Role,
  SubscriptionStatus,
  TaskStatus,
} from "@prisma/client";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

const prisma = new PrismaClient();

const IDS = {
  org: "11111111-1111-4111-8111-111111111111",
  admin: "22222222-2222-4222-8222-222222222221",
  manager: "22222222-2222-4222-8222-222222222222",
  member: "22222222-2222-4222-8222-222222222223",
  pipeline: "33333333-3333-4333-8333-333333333331",
  stages: {
    lead: "44444444-4444-4444-8444-444444444440",
    contacted: "44444444-4444-4444-8444-444444444441",
    qualified: "44444444-4444-4444-8444-444444444442",
    meeting: "44444444-4444-4444-8444-444444444443",
    proposal: "44444444-4444-4444-8444-444444444444",
    negotiation: "44444444-4444-4444-8444-444444444445",
    won: "44444444-4444-4444-8444-444444444446",
    lost: "44444444-4444-4444-8444-444444444447",
  },
  acme: "55555555-5555-4555-8555-555555555551",
  globex: "55555555-5555-4555-8555-555555555552",
  priya: "66666666-6666-4666-8666-666666666661",
  arjun: "66666666-6666-4666-8666-666666666662",
  meera: "66666666-6666-4666-8666-666666666663",
  dealLead: "77777777-7777-4777-8777-777777777771",
  dealProposal: "77777777-7777-4777-8777-777777777772",
  dealLost: "77777777-7777-4777-8777-777777777773",
} as const;

const DEFAULT_STAGES = [
  { id: IDS.stages.lead, name: "Lead", order: 0, isWon: false, isLost: false },
  { id: IDS.stages.contacted, name: "Contacted", order: 1, isWon: false, isLost: false },
  { id: IDS.stages.qualified, name: "Qualified", order: 2, isWon: false, isLost: false },
  { id: IDS.stages.meeting, name: "Meeting", order: 3, isWon: false, isLost: false },
  { id: IDS.stages.proposal, name: "Proposal", order: 4, isWon: false, isLost: false },
  { id: IDS.stages.negotiation, name: "Negotiation", order: 5, isWon: false, isLost: false },
  { id: IDS.stages.won, name: "Won", order: 6, isWon: true, isLost: false },
  { id: IDS.stages.lost, name: "Lost", order: 7, isWon: false, isLost: true },
] as const;

async function main() {
  await prisma.job.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.paymentEvent.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.task.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.pipelineStage.deleteMany();
  await prisma.pipeline.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.company.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      {
        id: IDS.admin,
        email: "admin@northwind.dev",
        fullName: "Asha Rao",
      },
      {
        id: IDS.manager,
        email: "manager@northwind.dev",
        fullName: "Kabir Shah",
      },
      {
        id: IDS.member,
        email: "rep@northwind.dev",
        fullName: "Leela Iyer",
      },
    ],
  });

  await prisma.organization.create({
    data: {
      id: IDS.org,
      name: "Northwind Sales",
      plan: Plan.STARTER,
      timezone: "Asia/Kolkata",
      currency: "INR",
    },
  });

  await prisma.organizationMember.createMany({
    data: [
      {
        organizationId: IDS.org,
        userId: IDS.admin,
        role: Role.ADMIN,
        department: Department.MANAGEMENT,
        status: MemberStatus.ACTIVE,
      },
      {
        organizationId: IDS.org,
        userId: IDS.manager,
        role: Role.MANAGER,
        department: Department.SALES,
        invitedById: IDS.admin,
        status: MemberStatus.ACTIVE,
      },
      {
        organizationId: IDS.org,
        userId: IDS.member,
        role: Role.MEMBER,
        department: Department.SALES,
        invitedById: IDS.manager,
        status: MemberStatus.ACTIVE,
      },
    ],
  });

  await prisma.pipeline.create({
    data: {
      id: IDS.pipeline,
      organizationId: IDS.org,
      name: "Sales",
      stages: {
        create: DEFAULT_STAGES.map((stage) => ({
          id: stage.id,
          organizationId: IDS.org,
          name: stage.name,
          order: stage.order,
          isWon: stage.isWon,
          isLost: stage.isLost,
        })),
      },
    },
  });

  await prisma.company.createMany({
    data: [
      {
        id: IDS.acme,
        organizationId: IDS.org,
        name: "Acme Labs",
        industry: "SaaS",
        employeeCount: 80,
        website: "https://acme.example",
        ownerId: IDS.member,
        tags: ["enterprise", "inbound"],
      },
      {
        id: IDS.globex,
        organizationId: IDS.org,
        name: "Globex Retail",
        industry: "Retail",
        employeeCount: 400,
        website: "https://globex.example",
        ownerId: IDS.manager,
        tags: ["outbound"],
      },
    ],
  });

  await prisma.contact.createMany({
    data: [
      {
        id: IDS.priya,
        organizationId: IDS.org,
        firstName: "Priya",
        lastName: "Mehta",
        email: "priya.mehta@acme.example",
        phone: "+91-98765-00001",
        jobTitle: "VP Sales",
        companyId: IDS.acme,
        source: ContactSource.WEBSITE,
        ownerId: IDS.member,
        tags: ["decision-maker"],
      },
      {
        id: IDS.arjun,
        organizationId: IDS.org,
        firstName: "Arjun",
        lastName: "Nair",
        email: "arjun.nair@acme.example",
        jobTitle: "Ops Lead",
        companyId: IDS.acme,
        source: ContactSource.REFERRAL,
        ownerId: IDS.member,
      },
      {
        id: IDS.meera,
        organizationId: IDS.org,
        firstName: "Meera",
        lastName: "Kapoor",
        email: "meera.kapoor@globex.example",
        jobTitle: "Procurement",
        companyId: IDS.globex,
        source: ContactSource.EVENT,
        ownerId: IDS.manager,
      },
    ],
  });

  await prisma.deal.createMany({
    data: [
      {
        id: IDS.dealLead,
        organizationId: IDS.org,
        name: "Acme starter seats",
        companyId: IDS.acme,
        primaryContactId: IDS.priya,
        pipelineId: IDS.pipeline,
        stageId: IDS.stages.lead,
        ownerId: IDS.member,
        amount: "180000.00",
        currency: "INR",
        expectedCloseDate: new Date("2026-10-31"),
        probability: 10,
      },
      {
        id: IDS.dealProposal,
        organizationId: IDS.org,
        name: "Acme enterprise expansion",
        companyId: IDS.acme,
        primaryContactId: IDS.arjun,
        pipelineId: IDS.pipeline,
        stageId: IDS.stages.proposal,
        ownerId: IDS.member,
        amount: "920000.00",
        currency: "INR",
        expectedCloseDate: new Date("2026-11-15"),
        probability: 55,
      },
      {
        id: IDS.dealLost,
        organizationId: IDS.org,
        name: "Globex seasonal",
        companyId: IDS.globex,
        primaryContactId: IDS.meera,
        pipelineId: IDS.pipeline,
        stageId: IDS.stages.lost,
        ownerId: IDS.manager,
        amount: "250000.00",
        currency: "INR",
        expectedCloseDate: new Date("2026-08-01"),
        probability: 0,
        lostReason: LostReason.PRICE,
      },
    ],
  });

  await prisma.activity.createMany({
    data: [
      {
        organizationId: IDS.org,
        type: ActivityType.NOTE,
        authorId: IDS.member,
        companyId: IDS.acme,
        contactId: IDS.priya,
        dealId: IDS.dealLead,
        content: "Inbound demo request from the pricing page.",
      },
      {
        organizationId: IDS.org,
        type: ActivityType.CALL,
        authorId: IDS.member,
        contactId: IDS.priya,
        dealId: IDS.dealProposal,
        content: "Discovery call. Wants SSO and usage-based billing.",
        occurredAt: new Date("2026-09-10T10:00:00.000Z"),
      },
      {
        organizationId: IDS.org,
        type: ActivityType.STATUS_CHANGE,
        authorId: IDS.manager,
        dealId: IDS.dealLost,
        content: "Moved to Lost",
        metadata: { oldStage: "Negotiation", newStage: "Lost", reason: "PRICE" },
      },
      {
        organizationId: IDS.org,
        type: ActivityType.EMAIL,
        authorId: IDS.manager,
        companyId: IDS.globex,
        contactId: IDS.meera,
        content: "Sent follow-up after the lost deal.",
      },
      {
        organizationId: IDS.org,
        type: ActivityType.MEETING,
        authorId: IDS.member,
        dealId: IDS.dealProposal,
        content: "Proposal walkthrough scheduled.",
      },
    ],
  });

  await prisma.task.createMany({
    data: [
      {
        organizationId: IDS.org,
        title: "Send Acme security questionnaire",
        assigneeId: IDS.member,
        createdById: IDS.manager,
        dealId: IDS.dealProposal,
        companyId: IDS.acme,
        dueDate: new Date("2026-09-25"),
        status: TaskStatus.OPEN,
      },
      {
        organizationId: IDS.org,
        title: "Log first touch with Priya",
        assigneeId: IDS.member,
        createdById: IDS.member,
        contactId: IDS.priya,
        dealId: IDS.dealLead,
        status: TaskStatus.DONE,
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        organizationId: IDS.org,
        userId: IDS.member,
        type: NotificationType.LEAD_ASSIGNED,
        payload: { dealId: IDS.dealLead, dealName: "Acme starter seats" },
      },
      {
        organizationId: IDS.org,
        userId: IDS.manager,
        type: NotificationType.DEAL_STAGE_CHANGED,
        payload: { dealId: IDS.dealLost, stage: "Lost" },
        readAt: new Date("2026-09-12T08:00:00.000Z"),
      },
      {
        organizationId: IDS.org,
        userId: IDS.member,
        type: NotificationType.TASK_ASSIGNED,
        payload: { title: "Send Acme security questionnaire" },
      },
    ],
  });

  await prisma.subscription.create({
    data: {
      organizationId: IDS.org,
      provider: PaymentProvider.RAZORPAY,
      providerCustomerId: "cust_northwind_rzp",
      providerSubscriptionId: "sub_northwind_rzp",
      status: SubscriptionStatus.ACTIVE,
      amount: "2999.00",
      currency: "INR",
      currentPeriodStart: new Date("2026-09-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
    },
  });

  await prisma.invoice.create({
    data: {
      organizationId: IDS.org,
      provider: PaymentProvider.RAZORPAY,
      providerInvoiceId: "inv_northwind_202609",
      amount: "2999.00",
      currency: "INR",
      status: InvoiceStatus.PAID,
    },
  });

  await prisma.paymentEvent.create({
    data: {
      organizationId: IDS.org,
      provider: PaymentProvider.RAZORPAY,
      providerEventId: "evt_rzp_seed_001",
      eventType: "invoice.paid",
      payload: { id: "evt_rzp_seed_001", type: "invoice.paid" },
      processedAt: new Date("2026-09-01T00:05:00.000Z"),
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        organizationId: IDS.org,
        actorId: IDS.admin,
        action: AuditAction.USER_INVITED,
        entityType: "organization_members",
        entityId: IDS.member,
        metadata: { email: "rep@northwind.dev", role: "MEMBER" },
      },
      {
        organizationId: IDS.org,
        actorId: IDS.admin,
        action: AuditAction.SUBSCRIPTION_UPDATED,
        entityType: "subscriptions",
        entityId: IDS.org,
        metadata: { provider: "RAZORPAY", status: "ACTIVE" },
      },
    ],
  });

  await prisma.job.create({
    data: {
      organizationId: IDS.org,
      type: "email.follow_up",
      payload: { dealId: IDS.dealLead, to: "priya.mehta@acme.example" },
    },
  });

  console.log("Seeded Northwind Sales (3 users, 3 deals, Razorpay subscription).");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
