import { execSync } from 'child_process';

/**
 * Auto-commit with a tag for the current sprint/round.
 * Non-fatal — if git is not available or fails, we just skip.
 */
export function gitAutoCommit(
  rootDir: string,
  message: string,
  tag?: string
): boolean {
  try {
    // Check if we're in a git repo
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: rootDir,
      stdio: 'pipe',
    });

    // Stage all changes
    execSync('git add -A', { cwd: rootDir, stdio: 'pipe' });

    // Check if there are staged changes
    try {
      execSync('git diff --cached --quiet', { cwd: rootDir, stdio: 'pipe' });
      // No changes to commit
      return false;
    } catch {
      // There are changes — proceed with commit
    }

    execSync(`git commit -m "${escapeGitMessage(message)}"`, {
      cwd: rootDir,
      stdio: 'pipe',
    });

    if (tag) {
      // Force-create tag (overwrite if exists)
      execSync(`git tag -f "${escapeGitMessage(tag)}"`, {
        cwd: rootDir,
        stdio: 'pipe',
      });
    }

    return true;
  } catch {
    // Non-fatal — git might not be available
    return false;
  }
}

/**
 * Rollback to a specific git tag.
 */
export function gitRollbackToTag(rootDir: string, tag: string): boolean {
  try {
    execSync(`git checkout "${escapeGitMessage(tag)}"`, {
      cwd: rootDir,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if git is available and we're in a repo.
 */
export function isGitRepo(rootDir: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: rootDir,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

function escapeGitMessage(msg: string): string {
  return msg.replace(/"/g, '\\"').replace(/\n/g, ' ');
}
