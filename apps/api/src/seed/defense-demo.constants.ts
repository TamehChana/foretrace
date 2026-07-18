import {
  RiskLevel,
  Role,
  TaskPriority,
  TaskStatus,
  TerminalIncidentCategory,
} from '@prisma/client';

/** Stable marker stored on demo projects for idempotent upserts. */
export const DEFENSE_DEMO_PROJECT_MARKER = 'defense-demo-v1';

export const DEFENSE_DEMO_ORG_SLUG = 'foretrace-defense-lab';
export const DEFENSE_DEMO_ORG_NAME = 'Foretrace Defense Lab';

/** Documented in docs/DEFENSE-DEMO.md — local/demo only. */
export const DEFENSE_DEMO_PASSWORD = 'DefenseDemo2026!';

export const DEFENSE_DEMO_USERS = {
  admin: {
    id: '11111111-1111-4111-8111-111111111101',
    email: 'admin@foretrace.local',
    displayName: 'Demo Admin',
    role: Role.ADMIN,
    githubLogin: 'foretrace-admin',
  },
  pm: {
    id: '11111111-1111-4111-8111-111111111102',
    email: 'pm@foretrace.local',
    displayName: 'Demo PM',
    role: Role.PM,
    githubLogin: 'foretrace-pm',
  },
  dev1: {
    id: '11111111-1111-4111-8111-111111111103',
    email: 'dev1@foretrace.local',
    displayName: 'Alice Developer',
    role: Role.DEVELOPER,
    githubLogin: 'alice-dev',
  },
  dev2: {
    id: '11111111-1111-4111-8111-111111111104',
    email: 'dev2@foretrace.local',
    displayName: 'Bob Developer',
    role: Role.DEVELOPER,
    githubLogin: 'bob-dev',
  },
} as const;

export const DEFENSE_DEMO_ORG_ID = '22222222-2222-4222-8222-222222222201';

export type DefenseDemoProjectKey =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL'
  | 'RECOVERING';

export type DefenseDemoTaskSpec = {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  /** UTC calendar-day offset from today (negative = overdue). */
  deadlineDays: number | null;
  assignee: keyof typeof DEFENSE_DEMO_USERS;
  githubIssueNumber?: number;
};

export type DefenseDemoTerminalSpec = {
  line: string;
  category: TerminalIncidentCategory;
  taskIndex?: number;
  occurrenceCount?: number;
};

export type DefenseDemoGithubEventSpec = {
  deliveryId: string;
  eventType: string;
  action?: string;
  actorLogin: string;
  payload: Record<string, unknown>;
};

export type DefenseDemoProjectSpec = {
  key: DefenseDemoProjectKey;
  id: string;
  name: string;
  description: string;
  repositoryFullName: string;
  openPullRequestCount: number;
  openIssueCount: number;
  tasks: DefenseDemoTaskSpec[];
  githubEvents: DefenseDemoGithubEventSpec[];
  terminal: DefenseDemoTerminalSpec[];
  /** Optional prior evaluation for RECOVERING trend demos. */
  priorEvaluation?: {
    level: RiskLevel;
    score: number;
    evaluatedDaysAgo: number;
  };
};

export const DEFENSE_DEMO_PROJECTS: Record<
  DefenseDemoProjectKey,
  DefenseDemoProjectSpec
> = {
  LOW: {
    key: 'LOW',
    id: '33333333-3333-4333-8333-333333333301',
    name: 'Demo — Greenfield Docs (LOW)',
    description: `${DEFENSE_DEMO_PROJECT_MARKER}:low — on-track delivery, healthy progress.`,
    repositoryFullName: 'foretrace-demo/greenfield-docs',
    openPullRequestCount: 1,
    openIssueCount: 2,
    tasks: [
      {
        id: '44444444-4444-4444-8444-444444444401',
        title: 'Author API reference',
        status: TaskStatus.DONE,
        priority: TaskPriority.MEDIUM,
        progress: 100,
        deadlineDays: -2,
        assignee: 'dev1',
        githubIssueNumber: 10,
      },
      {
        id: '44444444-4444-4444-8444-444444444402',
        title: 'Publish onboarding guide',
        status: TaskStatus.DONE,
        priority: TaskPriority.LOW,
        progress: 100,
        deadlineDays: -1,
        assignee: 'dev2',
        githubIssueNumber: 11,
      },
      {
        id: '44444444-4444-4444-8444-444444444403',
        title: 'Review screenshots for /docs',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.MEDIUM,
        progress: 85,
        deadlineDays: 12,
        assignee: 'dev1',
        githubIssueNumber: 12,
      },
      {
        id: '44444444-4444-4444-8444-444444444404',
        title: 'Spell-check release notes',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.LOW,
        progress: 70,
        deadlineDays: 14,
        assignee: 'dev2',
        githubIssueNumber: 13,
      },
    ],
    githubEvents: [
      {
        deliveryId: 'defense-demo-low-push-1',
        eventType: 'push',
        actorLogin: 'alice-dev',
        payload: {
          ref: 'refs/heads/main',
          repository: { full_name: 'foretrace-demo/greenfield-docs' },
          commits: [{ message: 'docs: polish onboarding (#12)' }],
        },
      },
      {
        deliveryId: 'defense-demo-low-push-2',
        eventType: 'push',
        actorLogin: 'bob-dev',
        payload: {
          ref: 'refs/heads/main',
          repository: { full_name: 'foretrace-demo/greenfield-docs' },
          commits: [{ message: 'docs: fix typos (#13)' }],
        },
      },
    ],
    terminal: [],
  },
  MEDIUM: {
    key: 'MEDIUM',
    id: '33333333-3333-4333-8333-333333333302',
    name: 'Demo — Checkout Revamp (MEDIUM)',
    description: `${DEFENSE_DEMO_PROJECT_MARKER}:medium — due-soon tasks with progress gaps.`,
    repositoryFullName: 'foretrace-demo/checkout-revamp',
    openPullRequestCount: 2,
    openIssueCount: 4,
    tasks: [
      {
        id: '44444444-4444-4444-8444-444444444411',
        title: 'Wire payment method selector',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        progress: 25,
        deadlineDays: 2,
        assignee: 'dev1',
        githubIssueNumber: 20,
      },
      {
        id: '44444444-4444-4444-8444-444444444412',
        title: 'Add address validation',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.MEDIUM,
        progress: 15,
        deadlineDays: 2,
        assignee: 'dev2',
        githubIssueNumber: 21,
      },
      {
        id: '44444444-4444-4444-8444-444444444413',
        title: 'Update checkout analytics events',
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        progress: 10,
        deadlineDays: 5,
        assignee: 'dev1',
        githubIssueNumber: 22,
      },
      {
        id: '44444444-4444-4444-8444-444444444414',
        title: 'QA smoke on staging',
        status: TaskStatus.TODO,
        priority: TaskPriority.LOW,
        progress: 0,
        deadlineDays: 9,
        assignee: 'dev2',
        githubIssueNumber: 23,
      },
    ],
    githubEvents: [
      {
        deliveryId: 'defense-demo-medium-pr-1',
        eventType: 'pull_request',
        action: 'opened',
        actorLogin: 'alice-dev',
        payload: {
          action: 'opened',
          pull_request: {
            number: 44,
            title: 'checkout: payment selector (#20)',
            body: 'Refs #20',
            merged: false,
          },
          repository: { full_name: 'foretrace-demo/checkout-revamp' },
        },
      },
      {
        deliveryId: 'defense-demo-medium-push-1',
        eventType: 'push',
        actorLogin: 'bob-dev',
        payload: {
          ref: 'refs/heads/main',
          repository: { full_name: 'foretrace-demo/checkout-revamp' },
          commits: [{ message: 'fix: validation edge case (#21)' }],
        },
      },
    ],
    terminal: [
      {
        line: 'error TS2345: Argument of type string is not assignable in CheckoutForm.tsx',
        category: TerminalIncidentCategory.BUILD,
        taskIndex: 0,
        occurrenceCount: 2,
      },
    ],
  },
  HIGH: {
    key: 'HIGH',
    id: '33333333-3333-4333-8333-333333333303',
    name: 'Demo — Payments API (HIGH)',
    description: `${DEFENSE_DEMO_PROJECT_MARKER}:high — overdue work plus terminal friction.`,
    repositoryFullName: 'foretrace-demo/payments-api',
    openPullRequestCount: 3,
    openIssueCount: 6,
    tasks: [
      {
        id: '44444444-4444-4444-8444-444444444421',
        title: 'Migrate ledger schema',
        status: TaskStatus.BLOCKED,
        priority: TaskPriority.CRITICAL,
        progress: 30,
        deadlineDays: -4,
        assignee: 'dev1',
        githubIssueNumber: 30,
      },
      {
        id: '44444444-4444-4444-8444-444444444422',
        title: 'Refund webhook handler',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        progress: 20,
        deadlineDays: -3,
        assignee: 'dev2',
        githubIssueNumber: 31,
      },
      {
        id: '44444444-4444-4444-8444-444444444423',
        title: 'Idempotency keys for charges',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        progress: 15,
        deadlineDays: -2,
        assignee: 'dev1',
        githubIssueNumber: 32,
      },
      {
        id: '44444444-4444-4444-8444-444444444424',
        title: 'Load test settlement path',
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        progress: 5,
        deadlineDays: 1,
        assignee: 'dev2',
        githubIssueNumber: 33,
      },
      {
        id: '44444444-4444-4444-8444-444444444425',
        title: 'Security review checklist',
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        progress: 0,
        deadlineDays: 2,
        assignee: 'pm',
        githubIssueNumber: 34,
      },
    ],
    githubEvents: [
      {
        deliveryId: 'defense-demo-high-issue-1',
        eventType: 'issues',
        action: 'opened',
        actorLogin: 'alice-dev',
        payload: {
          action: 'opened',
          issue: { number: 30, title: 'Ledger migration blocked' },
          repository: { full_name: 'foretrace-demo/payments-api' },
        },
      },
    ],
    terminal: [
      {
        line: 'error TS2307: Cannot find module @foretrace/payments-core',
        category: TerminalIncidentCategory.BUILD,
        taskIndex: 0,
        occurrenceCount: 5,
      },
      {
        line: 'FAIL payments/refund.spec.ts — Tests failed: 3 failed, 12 passed',
        category: TerminalIncidentCategory.TEST,
        taskIndex: 1,
        occurrenceCount: 4,
      },
      {
        line: 'Fetch failed: ECONNREFUSED 127.0.0.1:5432 postgres connection',
        category: TerminalIncidentCategory.DB,
        taskIndex: 2,
        occurrenceCount: 3,
      },
      {
        line: 'npm ERR! peer dependency conflict on stripe@14.x',
        category: TerminalIncidentCategory.DEPENDENCY,
        occurrenceCount: 2,
      },
    ],
  },
  CRITICAL: {
    key: 'CRITICAL',
    id: '33333333-3333-4333-8333-333333333304',
    name: 'Demo — Mobile Release (CRITICAL)',
    description: `${DEFENSE_DEMO_PROJECT_MARKER}:critical — many overdue tasks and repeated failures.`,
    repositoryFullName: 'foretrace-demo/mobile-release',
    openPullRequestCount: 5,
    openIssueCount: 9,
    tasks: [
      {
        id: '44444444-4444-4444-8444-444444444431',
        title: 'iOS signing pipeline',
        status: TaskStatus.BLOCKED,
        priority: TaskPriority.CRITICAL,
        progress: 10,
        deadlineDays: -7,
        assignee: 'dev1',
        githubIssueNumber: 40,
      },
      {
        id: '44444444-4444-4444-8444-444444444432',
        title: 'Android bundle size budget',
        status: TaskStatus.BLOCKED,
        priority: TaskPriority.CRITICAL,
        progress: 5,
        deadlineDays: -6,
        assignee: 'dev2',
        githubIssueNumber: 41,
      },
      {
        id: '44444444-4444-4444-8444-444444444433',
        title: 'Crash-free sessions gate',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        progress: 20,
        deadlineDays: -5,
        assignee: 'dev1',
        githubIssueNumber: 42,
      },
      {
        id: '44444444-4444-4444-8444-444444444434',
        title: 'Store metadata localization',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.MEDIUM,
        progress: 15,
        deadlineDays: -4,
        assignee: 'dev2',
        githubIssueNumber: 43,
      },
      {
        id: '44444444-4444-4444-8444-444444444435',
        title: 'Push notification QA',
        status: TaskStatus.TODO,
        priority: TaskPriority.HIGH,
        progress: 0,
        deadlineDays: -3,
        assignee: 'dev1',
        githubIssueNumber: 44,
      },
      {
        id: '44444444-4444-4444-8444-444444444436',
        title: 'Release notes approval',
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        progress: 0,
        deadlineDays: -2,
        assignee: 'pm',
        githubIssueNumber: 45,
      },
      {
        id: '44444444-4444-4444-8444-444444444437',
        title: 'Beta feedback triage',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.MEDIUM,
        progress: 25,
        deadlineDays: -1,
        assignee: 'dev2',
        githubIssueNumber: 46,
      },
    ],
    githubEvents: [
      {
        deliveryId: 'defense-demo-critical-pr-1',
        eventType: 'pull_request',
        action: 'opened',
        actorLogin: 'bob-dev',
        payload: {
          action: 'opened',
          pull_request: {
            number: 88,
            title: 'hotfix: signing (#40)',
            body: 'attempt fix #40',
            merged: false,
          },
          repository: { full_name: 'foretrace-demo/mobile-release' },
        },
      },
    ],
    terminal: [
      {
        line: 'docker build failed: cannot pull image node:20-alpine',
        category: TerminalIncidentCategory.DOCKER,
        taskIndex: 0,
        occurrenceCount: 8,
      },
      {
        line: 'error TS2345: Build failed with 14 errors in mobile/App.tsx',
        category: TerminalIncidentCategory.BUILD,
        taskIndex: 0,
        occurrenceCount: 6,
      },
      {
        line: 'FAIL e2e/release.spec.ts — Tests failed: 9 failed',
        category: TerminalIncidentCategory.TEST,
        taskIndex: 2,
        occurrenceCount: 7,
      },
      {
        line: 'UncaughtException: Fatal process out of memory during metro bundle',
        category: TerminalIncidentCategory.RUNTIME,
        taskIndex: 1,
        occurrenceCount: 5,
      },
      {
        line: '502 Bad Gateway from https://api.internal/deploy/hooks',
        category: TerminalIncidentCategory.API,
        occurrenceCount: 4,
      },
    ],
  },
  RECOVERING: {
    key: 'RECOVERING',
    id: '33333333-3333-4333-8333-333333333305',
    name: 'Demo — Platform Stabilization (RECOVERING)',
    description: `${DEFENSE_DEMO_PROJECT_MARKER}:recovering — improving after prior escalation.`,
    repositoryFullName: 'foretrace-demo/platform-stabilization',
    openPullRequestCount: 1,
    openIssueCount: 3,
    priorEvaluation: {
      level: RiskLevel.CRITICAL,
      score: 72,
      evaluatedDaysAgo: 6,
    },
    tasks: [
      {
        id: '44444444-4444-4444-8444-444444444441',
        title: 'Clear incident backlog',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        progress: 65,
        deadlineDays: 4,
        assignee: 'dev1',
        githubIssueNumber: 50,
      },
      {
        id: '44444444-4444-4444-8444-444444444442',
        title: 'Re-enable CI on main',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        progress: 55,
        deadlineDays: 5,
        assignee: 'dev2',
        githubIssueNumber: 51,
      },
      {
        id: '44444444-4444-4444-8444-444444444443',
        title: 'Patch overdue auth bug',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.CRITICAL,
        progress: 40,
        deadlineDays: -1,
        assignee: 'dev1',
        githubIssueNumber: 52,
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        title: 'Postmortem draft',
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        progress: 20,
        deadlineDays: 7,
        assignee: 'pm',
        githubIssueNumber: 53,
      },
    ],
    githubEvents: [
      {
        deliveryId: 'defense-demo-recovering-push-1',
        eventType: 'push',
        actorLogin: 'alice-dev',
        payload: {
          ref: 'refs/heads/main',
          repository: { full_name: 'foretrace-demo/platform-stabilization' },
          commits: [{ message: 'fix: auth regression (#52)' }],
        },
      },
      {
        deliveryId: 'defense-demo-recovering-pr-1',
        eventType: 'pull_request',
        action: 'opened',
        actorLogin: 'bob-dev',
        payload: {
          action: 'opened',
          pull_request: {
            number: 12,
            title: 'ci: re-enable workflows (#51)',
            body: 'Refs #51',
            merged: false,
          },
          repository: { full_name: 'foretrace-demo/platform-stabilization' },
        },
      },
    ],
    terminal: [
      {
        line: 'warn: flaky test still failing intermittently in auth.spec.ts',
        category: TerminalIncidentCategory.TEST,
        taskIndex: 2,
        occurrenceCount: 2,
      },
    ],
  },
};

export const DEFENSE_DEMO_PROJECT_ORDER: DefenseDemoProjectKey[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
  'RECOVERING',
];
