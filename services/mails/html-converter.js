const cajaSanitize = require('sanitize-caja');
const he = require('he');
const htmlToText = require('html-to-text');

const rules = [
  /<head\b[^<>]*>[\s\S]*?<\/head\s*>/gi,
  /<style\b[^<>]*>[\s\S]*?<\/style\s*>/gi,
  /<script\b[^<>]*>[\s\S]*?<\/script\s*>/gi,
  /(<([^>]+)>)/g,
];

const htmlConverter = {
  sanitize: (html, keepStyleTag = true) => {
    let sanitizedHtml = cajaSanitize(html);
    sanitizedHtml = he.decode(sanitizedHtml);
    if (!keepStyleTag) {
      sanitizedHtml = sanitizedHtml.replace(/<style.*<\/style>/g, '');
    }
    return sanitizedHtml;
  },
  getText: (html) => {
    return htmlToText.fromString(html, {
      ignoreHref: true,
      ignoreImage: true,
      wordwrap: false,
      uppercaseHeadings: false,
      tables: true,
      singleNewLineParagraphs: true
    })
    .split("\n")
    .map(line => line.replace(/\s+/g, ' ').trim())
    .join("\n")
    .replace(/\n\n+/g, "\n")
    .trim()
  },
  getTextMap: (html) => {
    let text = html;
    rules.forEach(rule => {
      text = text.replace(rule, (match) => {
        return ' '.repeat(match.length);
      });
    });
    return text;
  },
}

module.exports = htmlConverter;
