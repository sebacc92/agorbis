import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const parseTsx = (file) => {
  const text = readFileSync(file, "utf8");
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
};

const jsxAttribute = (source, opening, name) => {
  const attribute = opening.attributes.properties.find(
    (candidate) =>
      ts.isJsxAttribute(candidate) && candidate.name.getText(source) === name,
  );
  if (!attribute || !ts.isJsxAttribute(attribute)) return null;
  return (
    attribute.initializer?.getText(source).replace(/^['"]|['"]$/g, "") ?? ""
  );
};

const displayedExpressions = (file, expression) => {
  const source = parseTsx(file);
  const matches = [];
  const visit = (node) => {
    if (
      ts.isJsxExpression(node) &&
      node.expression?.getText(source) === expression &&
      ts.isJsxElement(node.parent)
    ) {
      matches.push({ source, opening: node.parent.openingElement });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return matches;
};

const displays = [
  ["src/components/polls/PollCard.tsx", "poll.question", false],
  ["src/components/polls/PollCard.tsx", "poll.description", true],
  ["src/routes/encuestas/[id]/index.tsx", "poll.question", false],
  ["src/routes/encuestas/[id]/index.tsx", "poll.description", true],
  ["src/routes/c/[slug]/encuestas/nueva/index.tsx", "preview.question", false],
  [
    "src/routes/c/[slug]/encuestas/nueva/index.tsx",
    "preview.description",
    true,
  ],
  ["src/routes/debates/[id]/index.tsx", "debate.title", false],
  ["src/routes/debates/[id]/index.tsx", "debate.body", true],
  ["src/components/debates/CommentCard.tsx", "comment.body", true],
  ["src/routes/c/[slug]/debates/index.tsx", "debate.title", false],
  ["src/routes/c/[slug]/debates/index.tsx", "debate.body", true],
  ["src/routes/c/[slug]/debates/nuevo/index.tsx", "preview.title", false],
  ["src/routes/c/[slug]/debates/nuevo/index.tsx", "preview.body", true],
  ["src/components/claims/ClaimCard.tsx", "claim.title", false],
  ["src/components/claims/ClaimCard.tsx", "claim.description", true],
  ["src/routes/reclamos/[id]/index.tsx", "claim.title", false],
  ["src/routes/reclamos/[id]/index.tsx", "claim.description", true],
  ["src/components/claims/ClaimTimeline.tsx", "event.body", true],
  ["src/routes/c/[slug]/reclamos/nuevo/index.tsx", "preview.title", false],
  ["src/routes/c/[slug]/reclamos/nuevo/index.tsx", "preview.description", true],
  ["src/components/projects/ProjectCard.tsx", "project.title", false],
  ["src/components/projects/ProjectCard.tsx", "project.summary", true],
  ["src/components/projects/PledgePanel.tsx", "myPledge.message", true],
  ["src/components/projects/PledgePanel.tsx", "entry.message", true],
  ["src/routes/proyectos/[id]/index.tsx", "project.title", false],
  ["src/routes/proyectos/[id]/index.tsx", "project.summary", true],
  ["src/routes/proyectos/[id]/index.tsx", "project.plan", true],
  ["src/routes/proyectos/[id]/index.tsx", "project.resources_needed", true],
  ["src/routes/proyectos/[id]/index.tsx", "entry.body", true],
  ["src/routes/c/[slug]/proyectos/nuevo/index.tsx", "preview.title", false],
  ["src/routes/c/[slug]/proyectos/nuevo/index.tsx", "preview.summary", true],
  ["src/routes/c/[slug]/proyectos/nuevo/index.tsx", "preview.plan", true],
  [
    "src/routes/c/[slug]/proyectos/nuevo/index.tsx",
    "preview.resources_needed",
    true,
  ],
];

for (const [file, expression, multiline] of displays) {
  const matches = displayedExpressions(file, expression);
  assert.ok(matches.length > 0, `${file}: no muestra {${expression}}`);
  assert.ok(
    matches.some(({ source, opening }) =>
      jsxAttribute(source, opening, "dir")?.includes("auto"),
    ),
    `${file}: {${expression}} debe estar en un elemento con dir="auto"`,
  );
  if (multiline) {
    assert.ok(
      matches.some(({ source, opening }) =>
        jsxAttribute(source, opening, "class")?.includes("ugc-text"),
      ),
      `${file}: {${expression}} debe usar la utilidad ugc-text`,
    );
  }
}

const ui = parseTsx("src/components/ui/index.tsx");
const defaultAutoDirection = new Set();
const visitUi = (node) => {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    (node.name.text === "Input" || node.name.text === "Textarea") &&
    node.initializer &&
    ts.isCallExpression(node.initializer)
  ) {
    const renderer = node.initializer.arguments[0];
    const parameter =
      renderer &&
      (ts.isArrowFunction(renderer) || ts.isFunctionExpression(renderer))
        ? renderer.parameters[0]
        : null;
    if (parameter && ts.isObjectBindingPattern(parameter.name)) {
      const dir = parameter.name.elements.find(
        (element) => element.name.getText(ui) === "dir",
      );
      if (dir?.initializer?.getText(ui) === '"auto"') {
        defaultAutoDirection.add(node.name.text);
      }
    }
  }
  ts.forEachChild(node, visitUi);
};
visitUi(ui);
assert.deepEqual(defaultAutoDirection, new Set(["Input", "Textarea"]));

const css = readFileSync("src/global.css", "utf8");
assert.match(css, /@utility\s+ugc-text\s*\{[^}]*unicode-bidi:\s*plaintext;/s);

const countIsolatedTitles = (file, expressionFragment) => {
  const source = parseTsx(file);
  let count = 0;
  const visit = (node) => {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(source) === "bdi" &&
      jsxAttribute(source, node.openingElement, "dir") === "auto" &&
      node.getText(source).includes(expressionFragment)
    ) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return count;
};

assert.ok(
  countIsolatedTitles("src/routes/perfil/index.tsx", "item.title") >= 4,
);
assert.ok(
  countIsolatedTitles(
    "src/routes/c/[slug]/proyectos/nuevo/index.tsx",
    "sourceClaim.title",
  ) >= 1,
);

console.log(
  `✓ UGC bidi · ${displays.length} superficies y formularios verificados`,
);
