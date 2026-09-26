/**
 * The verdict step of `.github/workflows/harness-compat.yml`, one cell at a
 * time. Called from actions/github-script:
 *
 *   await require('./scripts/harness-verdict.cjs')({ github, context, core })
 *
 * Reads the stage outcomes from `STAGE_<name>` environment variables (a
 * step's `outcome`: success / failure / skipped / cancelled / empty), the
 * stages the cell was expected to run from `EXPECTED`, the job's status so
 * far from `JOB_STATUS`, and `CELL`, `VERSION`, `INCOMPLETE`, `REPORT`.
 *
 * - Any failed stage fails the job. A cancelled stage is a failed one: the
 *   workflow runs the verdict only when the run itself was not cancelled, so
 *   a stage cut off anyway was cut off by something going wrong.
 * - A job that failed without a failed stage — checkout, Node, `npm ci`, the
 *   cache or the artifact upload broke — fails as the stage `job`.
 * - With REPORT=true, a failure opens an `upstream-drift` issue titled
 *   `Harness compatibility broken against @<cell>`, or comments on the open
 *   one; a cell whose every expected stage succeeded comments on that issue
 *   and closes it. An incomplete train (published without packages this
 *   plugin needs, or not yet at all) does neither: it is not drift, and it is
 *   not evidence that drift was fixed — unless a stage that still ran on it
 *   failed (admission: the ranges refuse the version).
 *
 * `unreported` is the catch-all job after every cell, on reporting runs: a
 * job of this run that failed or was cancelled while its cell's issue does
 * not mention the run — its checkout failed, the verdict itself failed, the
 * job ran out of time, the plan never produced cells — is filed the same way,
 * so a scheduled failure never ends in a red run alone.
 *
 * CommonJS because github-script evaluates the step as a CommonJS function
 * body and this repository is `"type": "module"`.
 */

const LABEL = 'upstream-drift'

const ADVICE = {
  resolve: 'the cell did not resolve to a published version — read the step log: npm\'s registry did not answer (an outage, not drift: re-run once it answers), a desktop feed disagrees across platforms, or pinned/floor lost a package they need.',
  install: 'the repointed graph did not install. The step log ends with why: `@deepseek-ai/dsh` at this version installs on its own (the conflict is this repository\'s), or npm did not answer or timed out (an outage, not drift: re-run once it answers).',
  types: 'an upstream export was renamed or removed; the typecheck output names it.',
  tests: 'the plugin\'s own tests fail against this train\'s packages.',
  admission: 'a peer range does not admit this version, so dsh ≥0.1.7 refuses to install or load the plugin. Widen only after types, tests and `node scripts/smoke-boot.mjs --dsh <version> --accept-risk` pass.',
  smoke: 'the packed plugin did not install, activate or get served on a real `dsh --profile web`; the step summary names the stage.',
  feed: 'the desktop update feed could not be read.',
  download: 'the desktop zip did not download or did not match the feed\'s sha512.',
  runtime: 'the desktop app\'s bundled runtime is not the version its feed announces.',
  job: 'a step outside the stages failed — checkout, Node, `npm ci`, the cache or the artifact upload; read the job log. Usually a runner or network fault, not drift.',
}

/** What `unreported` says of a job that ended with no verdict on record. */
const NO_VERDICT = {
  plan: 'the cell list did not expand into a matrix, so no cell ran — read the plan job\'s log: npm\'s registry or a desktop feed did not answer (an outage, not drift), or the sweep found no version.',
  cell: 'the job ended before its verdict could report: its checkout or setup failed, the verdict itself failed, or the job ran out of time. The run names the step that stopped it.',
}

const CLOSES = 'This issue closes itself on the first run where every stage of this cell passes again.'

/** The one issue a failing cell keeps open; `plan` is the job that expands the cells. */
function titleFor(cell) {
  return cell === 'plan' ? 'Harness compatibility run could not plan its cells' : `Harness compatibility broken against @${cell}`
}

function runUrl(context) {
  return `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`
}

/** Comment `body` on the open issue titled `title`, or open it with the label. */
async function file(github, { owner, repo }, open, title, body) {
  const hit = open.find((issue) => issue.title === title && !issue.pull_request)
  if (hit !== undefined) {
    await github.rest.issues.createComment({ owner, repo, issue_number: hit.number, body })
    return
  }
  await github.rest.issues.getLabel({ owner, repo, name: LABEL })
    .catch(() => github.rest.issues.createLabel({ owner, repo, name: LABEL, color: 'd93f0b', description: 'The plugin no longer works on a published harness train' }))
  await github.rest.issues.create({ owner, repo, title, body, labels: [LABEL] })
}

function outcomes(env) {
  return Object.fromEntries(Object.entries(env)
    .filter(([key]) => key.startsWith('STAGE_'))
    .map(([key, value]) => [key.slice('STAGE_'.length), value || 'not run']))
}

/** Pure part: what the stages add up to. */
function judge(env) {
  const stages = outcomes(env)
  const expected = String(env.EXPECTED ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const failed = Object.entries(stages).filter(([, outcome]) => outcome === 'failure' || outcome === 'cancelled').map(([name]) => name)
  if (failed.length === 0 && env.JOB_STATUS === 'failure') failed.push('job')
  const incomplete = env.INCOMPLETE === 'true'
  const green = !incomplete && failed.length === 0 && expected.length > 0 && expected.every((name) => stages[name] === 'success')
  return { stages, expected, failed, incomplete, green }
}

async function verdict({ github, context, core, env = process.env }) {
  const cell = env.CELL
  const version = env.VERSION || 'unresolved'
  const { stages, failed, incomplete, green } = judge(env)
  const run = runUrl(context)

  await core.summary
    .addHeading(`harness@${cell} (${version}) — ${failed.length > 0 ? `failed: ${failed.join(', ')}` : incomplete ? 'incomplete train, neutral' : green ? 'green' : 'not fully run'}`, 3)
    .addList(Object.entries(stages).map(([name, outcome]) => `${name}: ${outcome}`))
    .write()

  if (env.REPORT === 'true') {
    const { owner, repo } = context.repo
    const title = titleFor(cell)
    const open = await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: 'open', labels: LABEL })
    const hit = open.find((issue) => issue.title === title && !issue.pull_request)
    if (failed.length > 0) {
      await file(github, context.repo, open, title, [
        `\`harness@${cell}\` resolved to \`${version}\` and failed: **${failed.join(', ')}**.`,
        '',
        `Run: ${run}`,
        '',
        ...failed.map((name) => `- **${name}**${stages[name] === 'cancelled' ? ' (cancelled, which counts as failed)' : ''}: ${ADVICE[name] ?? 'see the step log.'}`),
        '',
        CLOSES,
      ].join('\n'))
    } else if (green && hit !== undefined) {
      const passed = Object.entries(stages).filter(([, o]) => o === 'success').map(([name]) => name)
      await github.rest.issues.createComment({
        owner, repo, issue_number: hit.number,
        body: `Green against \`${version}\`: ${passed.join(', ')} all passed.\n\nRun: ${run}`,
      })
      await github.rest.issues.update({ owner, repo, issue_number: hit.number, state: 'closed', state_reason: 'completed' })
    }
  }

  if (failed.length > 0) core.setFailed(`harness@${cell} (${version}): ${failed.join(', ')}`)
  return { failed, incomplete, green }
}

/**
 * The cell a job of this workflow checks: `harness@<cell>`, also when a caller
 * prefixes it (`harness / harness@floor`), or `plan`. `undefined` for any
 * other job.
 */
function cellOf(jobName) {
  const name = String(jobName).split(' / ').pop().trim()
  if (name === 'plan') return 'plan'
  return /^harness@(\S+)$/.exec(name)?.[1]
}

const ENDED = ['failure', 'cancelled', 'timed_out']

/**
 * The catch-all: file every job of this run that failed or was cancelled and
 * whose cell's issue does not mention this run yet — its verdict never ran,
 * crashed, or never got the chance. A job whose verdict filed it is left
 * alone, so nothing is filed twice. Closes the plan issue once planning works
 * again; a cell's own issue is closed by that cell's verdict.
 */
async function unreported({ github, context, core }) {
  const { owner, repo } = context.repo
  const run = runUrl(context)
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, { owner, repo, run_id: context.runId, filter: 'latest', per_page: 100 })
  const open = await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: 'open', labels: LABEL })
  const mentions = async (issue) => {
    if (String(issue.body ?? '').includes(run)) return true
    const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: issue.number, per_page: 100 })
    return comments.some((comment) => String(comment.body ?? '').includes(run))
  }

  const filed = []
  for (const job of jobs) {
    const cell = cellOf(job.name)
    if (cell === undefined) continue
    const title = titleFor(cell)
    const hit = open.find((issue) => issue.title === title && !issue.pull_request)
    if (cell === 'plan' && job.conclusion === 'success' && hit !== undefined) {
      await github.rest.issues.createComment({ owner, repo, issue_number: hit.number, body: `The plan works again.\n\nRun: ${run}` })
      await github.rest.issues.update({ owner, repo, issue_number: hit.number, state: 'closed', state_reason: 'completed' })
      continue
    }
    if (!ENDED.includes(job.conclusion)) continue
    if (hit !== undefined && await mentions(hit)) continue
    const stopped = (job.steps ?? []).filter((step) => ENDED.includes(step.conclusion)).map((step) => `\`${step.name}\` (${step.conclusion})`)
    const ended = job.conclusion === 'failure' ? 'failed' : `ended ${job.conclusion}`
    await file(github, context.repo, open, title, [
      cell === 'plan' ? `The \`plan\` job ${ended}, so no cell ran.` : `\`harness@${cell}\` ${ended} before its verdict could report.`,
      '',
      `Run: ${run}`,
      '',
      `- **job**: ${cell === 'plan' ? NO_VERDICT.plan : NO_VERDICT.cell}${stopped.length > 0 ? ` Stopped at ${stopped.join(', ')}.` : ''}`,
      '',
      cell === 'plan' ? 'This issue closes itself on the first run that plans its cells again.' : CLOSES,
    ].join('\n'))
    filed.push(cell)
  }
  await core.summary.addHeading(filed.length > 0 ? `Filed jobs that ended without a verdict: ${filed.join(', ')}` : 'Every failing job reported through its own verdict', 3).write()
  return { filed }
}

module.exports = verdict
module.exports.judge = judge
module.exports.cellOf = cellOf
module.exports.unreported = unreported
