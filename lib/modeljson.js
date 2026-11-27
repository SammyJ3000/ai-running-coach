// Model replies -> JSON. The prompts ask for JSON only, but a reply can still arrive in a code fence or with a sentence
// around it. parseModelJson() takes the one JSON object out of the reply, and an optional check (a function that
// returns a list of problems, like validatePlan in lib/rules.js) decides whether it has the right shape.
// Anything else throws a ModelReplyError, so a bad reply is never stored or shown as if it were good.

class ModelReplyError extends Error {
  constructor(message) { super(message); this.name = 'ModelReplyError'; }
}

function parseModelJson(text, check) {
  const t = String(text == null ? '' : text);
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : t;
  const a = body.indexOf('{'), b = body.lastIndexOf('}');
  if (a < 0 || b <= a) throw new ModelReplyError('reply has no JSON object');
  let value;
  try { value = JSON.parse(body.slice(a, b + 1)); } catch (e) { throw new ModelReplyError('reply is not valid JSON: ' + e.message); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ModelReplyError('reply is not a JSON object');
  const problems = check ? check(value) : [];
  if (problems.length) throw new ModelReplyError('reply has the wrong shape: ' + problems.join('; '));
  return value;
}

module.exports = { parseModelJson, ModelReplyError };
