/**
 * @typedef {import("eslint").Linter.LintMessage} LintMessage
 * @typedef {import("eslint").ESLint.LintResult} LintResult
 * @typedef {import("eslint").ESLint.LintResultData} LintResultData
 */

/** @type {(keyof LintMessage)[]} */
const messageColumns = ["line", "column", "severity", "message", "ruleId"];

/**
 * Defines the message headings.
 *
 * @type {{[k in keyof LintMessage]?: string}}
 */
const messageHeadings = {
  line: "L",
  column: "C",
  severity: "Severity",
  message: "Message",
  ruleId: "Rule",
};

/**
 * Default formatter, that transforms a given value to its
 * string representation.
 *
 * @param {LintMessage[keyof LintMessage]} v value to transform
 * @returns {string} String representation.
 */
const defaultMessageColumnFormatter = (v) => String(v);

/**
 * Specialized formatters
 *
 * @type {{[k in keyof LintMessage]?: (v: LintMessage[keyof LintMessage]) => string}}
 */
const messageColumnFormatters = {
  severity: (v) => {
    if (v == 0) {
      return "off";
    }
    if (v == 1) {
      return "warn";
    }
    if (v == 2) {
      return "error";
    }
    return "unknown";
  },
};

/**
 * Escape strings to be represented within Markdown without side-effects.
 *
 * @param {string} str string to possibly escape
 * @return string escaped string
 */
const escapeForMarkdown = (str) => {
  return str
  .replaceAll("\\", "\\\\")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll("&", "&amp;")
  .replaceAll("`", "\\`")
  .replaceAll("[", "\\[")
  .replaceAll("]", "\\]")
  .replaceAll("*", "\\*")
  .replaceAll("_", "\\_")
  .replaceAll("#", "\\#")
  ;
};

/** @type {{[k in typeof messageColumns[number]]: "-"}} */
const headerSeparator = new Map(messageColumns.map((c) => [c, "-"]));

/**
 * @param {import("eslint").ESLint.LintResult[]} results
 * @param {import("eslint").ESLint.LintResultData?} context
 * @return {string}
 */
const markdown = (results, context) => {
  const render = (result) => markdownSingle(result, context);
  return results.map(render).join("");
};

/**
 * @param {LintResult} results
 * @param {LintResultData?} context
 * @return {string}
 */
const markdownSingle = (result, context) => {
  const {
    filePath,
    messages,
    suppressedMessages,
    errorCount,
    fatalErrorCount,
    warningCount,
    fixableErrorCount,
    fixableWarningCount,
    usedDeprecatedRules,
  } = result;
  const { cwd } = context;

  const hasIssues = errorCount + fatalErrorCount + warningCount;
  if (hasIssues == 0) {
    return "";
  }

  const relativeFilePath = relativize(filePath, context);
  const formattedMessages = messages.map(formatMessage);
  const lengths = columnLengths([messageHeadings, ...formattedMessages]);
  const lines = [];

  lines.push(`## ${relativeFilePath}`);
  lines.push(``);

  if (relativeFilePath != filePath) {
    lines.push(`(\`${filePath}\`)`);
    lines.push(``);
  }

  lines.push(formatMessage2Markdown(messageHeadings, lengths));
  lines.push(formatMessage2Markdown(headerSeparator, lengths, "-"));
  formattedMessages.forEach((message) =>
    lines.push(formatMessage2Markdown(message, lengths)),
  );
  lines.push(``);
  lines.push(summarize(messages));
  return lines.join("\n");
};

/**
 * @param {string} filePath
 * @param {LintResultData?} context
 * @return {string}
 */
const relativize = (filePath, context) => {
  const { cwd = "" } = context ?? {};
  if (cwd && filePath.startsWith(cwd)) {
    return filePath.substring(cwd.length + 1);
  }
  return filePath;
};

/**
 * @param {LintMessage[]} messages
 * @returns {{[k in keyof LintMessage]: number}} column lengths
 */
const columnLengths = (messages) => {
  /**
   * @param {{[k in keyof LintMessage]: number}} accumulator
   * @param {{[k in keyof LintMessage]: number}} currentValue
   * @returns {{[k in keyof LintMessage]: number}} column lengths
   */
  const reduceFn = (accumulator, currentValue) => {
    const result = { ...accumulator };
    Object.entries(currentValue).forEach(([k, v]) => {
      result[k] = Math.max(String(v).length, result[k] ?? 0);
    });
    return result;
  };
  return messages.reduce(reduceFn, {});
};

/**
 * @param {LintMessage} message
 * @returns {{[k in keyof LintMessage]: string}} formatted message columns
 */
const formatMessage = (message) => {
  const formattedEntries = Object.entries(message).map(([k, v]) => {
    const formatter =
      messageColumnFormatters[k] ?? defaultMessageColumnFormatter;
    return [k, formatter(v)];
  });
  return Object.fromEntries(formattedEntries);
};

/**
 * @param {{[k in keyof LintMessage]: string}} message
 * @param {{[k in keyof LintMessage]: number}} columnLengths
 * @param {string} fillString
 * @param {string} fillPrefix
 * @param {string} fillPostfix
 * @returns {string} formatted message
 */
const formatMessage2Markdown = (
  message,
  columnLengths,
  fillString = " ",
  fillPrefix = fillString,
  fillPostfix = fillPrefix,
) => {
  return (
    `|${fillPrefix}` +
    messageColumns
      .map((column) => {
        const columnLength = columnLengths[column] ?? 0;
        const value = String(message[column] ?? "");
        return escapeForMarkdown(value.padEnd(columnLength, fillString));
      })
      .join(`${fillPrefix}|${fillPostfix}`) +
    `${fillPostfix}|`
  );
};

export default markdown;


const problems = (n) => `${n} ${n === 1 ? "problem" : "problems"}`;
const errors = (n) => `${n} ${n === 1 ? "error" : "errors"}`;
const warnings = (n) => `${n} ${n === 1 ? "warning" : "warnings"}`;

/**
 * @param {LintMessage[]} messages
 * @returns {string} summary
 */
const summarize = (messages) => {
  const statistics = {
    problems: 0,
    errors: 0,
    warnings: 0,
    fixableProblems: 0,
    fixableErrors: 0,
    fixableWarnings: 0,
  };
  messages.forEach((message) => {
    const isWarning = message.severity === 1;
    const isError = message.severity === 2;
    const fixable = !!message.fix;

    if (isWarning || isError) {
      statistics.problems++;
      if (isWarning) {
        statistics.warnings++;
        if (fixable) {
          statistics.fixableWarnings++;
          statistics.fixableProblems++;
        }
      } else if (isError) {
        statistics.errors++;
        if (fixable) {
          statistics.fixableErrors++;
          statistics.fixableProblems++;
        }
      }
    }
  });
  if (statistics.problems === 0) {
    return [];
  }

  const problemSummary = `${problems(statistics.problems)} (${errors(statistics.errors)}, ${warnings(statistics.warnings)})`;
  const fixableSummary = `${errors(statistics.fixableErrors)} and ${warnings(statistics.fixableWarnings)} potentially fixable with the \`--fix\` option.`;

  if (statistics.fixableProblems > 0) {
    return `
${problemSummary} \\
${fixableSummary}
    `;
  }
  return problemSummary;
};
