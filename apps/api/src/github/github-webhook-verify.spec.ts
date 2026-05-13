import {
  fullNameFromRepositoryLike,
  normalizeRepositoryFullName,
  repositoryFullNameFromPayload,
} from './github-webhook-verify';

describe('fullNameFromRepositoryLike', () => {
  it('uses full_name when present', () => {
    expect(
      fullNameFromRepositoryLike({ full_name: 'AcMe/WiDgEt' }),
    ).toBe('acme/widget');
  });

  it('builds from owner.login and name when full_name missing', () => {
    expect(
      fullNameFromRepositoryLike({
        name: 'Hello-World',
        owner: { login: 'octocat' },
      }),
    ).toBe('octocat/hello-world');
  });
});

describe('repositoryFullNameFromPayload', () => {
  it('reads top-level repository', () => {
    expect(
      repositoryFullNameFromPayload(
        { repository: { full_name: 'org/repo' } },
        'push',
      ),
    ).toBe('org/repo');
  });

  it('reads repository under workflow_run', () => {
    expect(
      repositoryFullNameFromPayload(
        {
          workflow_run: {
            id: 1,
            repository: { name: 'r', owner: { login: 'o' } },
          },
        },
        'workflow_run',
      ),
    ).toBe('o/r');
  });

  it('reads repository under check_suite', () => {
    expect(
      repositoryFullNameFromPayload(
        {
          check_suite: {
            id: 9,
            repository: { full_name: 'Org/Service' },
          },
        },
        'check_suite',
      ),
    ).toBe('org/service');
  });

  it('falls back to repository nested on issue when root repository missing', () => {
    expect(
      repositoryFullNameFromPayload(
        {
          action: 'closed',
          issue: {
            number: 3,
            repository: { full_name: 'acme/widget' },
          },
        },
        'issues',
      ),
    ).toBe('acme/widget');
  });
});

describe('normalizeRepositoryFullName', () => {
  it('lowercases and trims', () => {
    expect(normalizeRepositoryFullName('  Foo/BAR  ')).toBe('foo/bar');
  });
});
