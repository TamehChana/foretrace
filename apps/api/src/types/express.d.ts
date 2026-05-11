declare global {
  namespace Express {
    /** Populated by Passport after deserialize; never includes password hash. */
    interface User {
      id: string;
      email: string;
      displayName: string | null;
    }

    interface Request {
      /** Set by `CliIngestAuthGuard` for `POST …/terminal/batches`. */
      cliIngestContext?: {
        tokenId: string;
        organizationId: string;
        projectId: string;
      };
    }
  }
}

export {};
