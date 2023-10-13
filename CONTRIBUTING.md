# Contributing Guidelines

Thank you for your interest in contributing to the Oasis Sapphire! There are
many ways to contribute, and this document should not be considered
encompassing.

If you have a general question on how to use and deploy our software, please
read our [General Documentation](https://docs.oasis.io) or join our
[community Discord](https://oasis.io/discord).

For concrete feature requests and/or bug reports, please file an issue in this
repository as described below.

<!-- markdownlint-disable heading-increment -->

#### Table of Contents

<!-- markdownlint-enable heading-increment -->

[Feature Requests](#feature-requests)

[Bug Reports](#bug-reports)

[Development](#development)

- [Building](#building-and-testing)
- [Contributing Code](#contributing-code)
- [Style Guides](#style-guides)
  - [Git Commit Messages](#git-commit-messages)
  - [Go Style Guide](#go-style-guide)

## Feature Requests

To request new functionality the most appropriate place to propose it is as a
[new Feature request] in this repository.

<!-- markdownlint-disable line-length -->

[new feature request]:
  https://github.com/oasisprotocol/sapphire-paratime/issues/new?template=feature_request.md

<!-- markdownlint-enable line-length -->

## Bug Reports

Bugs are a reality for any software project. We can't fix what we don't know
about!

If you believe a bug report presents a security risk, please follow
[responsible disclosure](https://en.wikipedia.org/wiki/Responsible_disclosure)
and report it directly to security@oasisprotocol.org instead of filing a public
issue or posting it to a public forum. We will get back to you promptly.

Otherwise, please, first search between [existing issues in our repository] and
if the issue is not reported yet, [file a new one].

<!-- markdownlint-disable line-length -->

[existing issues in our repository]:
  https://github.com/oasisprotocol/sapphire-paratime/issues
[file a new one]:
  https://github.com/oasisprotocol/sapphire-paratime/issues/new?template=bug_report.md

<!-- markdownlint-enable line-length -->

## Development

### Building

Building documentation lies at the top-level
[README](https://github.com/oasisprotocol/sapphire-paratime/blob/main/README.md).

### Contributing Code

- **File issues:** Please make sure to first file an issue (i.e. feature
  request, bug report) before you actually start work on something.

- **Create branches:** If you have write permissions to the repository, you can
  create user-id prefixed branches (e.g. user/feature/foobar) in the main
  repository. Otherwise, fork the main repository and create your branches
  there.

  - Good habit: regularly rebase to the `HEAD` of `main` branch of the main
    repository to make sure you prevent nasty conflicts:

    ```bash
    git rebase <main-repo>/main
    ```

  - Push your branch to GitHub regularly so others can see what you are working
    on:

    ```bash
    git push -u <main-repo-or-your-fork> <branch-name>
    ```

    _Note that you are allowed to force push into your development branches._

- **Use draft pull requests for work-in-progress:**

  - The draft state signals that the code is not ready for review, but still
    gives a nice URL to track the ongoing work.

- _main_ branch is protected and will require at least 1 code review approval
  from a code owner before it can be merged.

- When coding, please follow these standard practices:

  - **Write tests:** Especially when fixing bugs, make a test so we know that
    we’ve fixed the bug and prevent it from reappearing in the future.
  - **Logging:** Please follow the logging conventions in the rest of the code
    base.
  - **Instrumentation:** Please follow the instrumentation conventions in the
    rest of the code.
    - Try to instrument anything that would be relevant to an operational
      network.

- **Change Log:** This project generates release changelogs automatically using
  commit messages. Please follow commit format as described in the
  [Style guide](#git-commit-messages).

- **Check CI:** Don’t break the build!

  - Make sure all tests pass before submitting your pull request for review.

- **Signal PR review:**

  - Mark the draft pull request as _Ready for review_.
  - Please include good high-level descriptions of what the pull request does.
  - The description should include references to all GitHub issues addressed by
    the pull request. Include the status ("done", "partially done", etc).
  - Provide some details on how the code was tested.
  - After you are nearing review (and definitely before merge) **squash commits
    into logical parts** (avoid squashing over merged commits, use rebase
    first!). Use proper commit messages which explain what was changed in the
    given commit and why.

- **Get a code review:**

  - Code owners will be automatically assigned to review based on the files that
    were changed.
  - You can generally look up the last few people to edit the file to get the
    best person to review.
  - When addressing the review: Make sure to address all comments, and respond
    to them so that the reviewer knows what has happened (e.g. "done" or
    "acknowledged" or "I don't think so because ...").

- **Merge:** Once approved, the creator of the pull request should merge the
  branch, close the pull request, and delete the branch. If the creator does not
  have write access to the repository, one of the committers should do so
  instead.

- **Signal to close issues:** Let the person who filed the issue close it. Ping
  them in a comment (e.g. @user) making sure you’ve commented how an issue was
  addressed.
  - Anyone else with write permissions should be able to close the issue if not
    addressed within a week.

### Style Guides

#### Git Commit Messages

A quick summary:

- Separate subject from body with a blank line.
- Limit the subject line to 80 characters.
- Prefix the subject line with one of:
  - "breaks:" if commit implements a non-backward compatible breaking change
  - "fix:" if commit implements a bugfix
  - "feat:" if commit implements a new feature
  - "deps:" if commit updates a dependency
  - "other:" if commit doesn't fall in any of the above categories
- Do not end the subject line with a period.
- Wrap the body at 80 characters.
- Use the body to explain _what_ and _why_ vs. _how_.

#### Go Style Guide

Go code should use the [`gofumpt`](https://github.com/mvdan/gofumpt) 
formatting style. Be sure to run `make fmt` before pushing any code.