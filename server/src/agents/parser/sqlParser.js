const CREATE_TABLE_RE = /CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?(\w+)/gi;
const FROM_RE = /\bFROM\s+(?:\w+\.)?(\w+)/gi;
const JOIN_RE = /\bJOIN\s+(?:\w+\.)?(\w+)/gi;
const INSERT_RE = /\bINSERT\s+INTO\s+(?:\w+\.)?(\w+)/gi;
const UPDATE_RE = /\bUPDATE\s+(?:\w+\.)?(\w+)/gi;
const COLUMN_RE = /\b(\w+)\s+(?:INT|TEXT|VARCHAR|BOOLEAN|NUMERIC|TIMESTAMPTZ|UUID|JSONB|SERIAL|BIGINT|FLOAT|REAL|DATE|CHAR)\b/gi;

function matchAll(re, str) {
  const matches = [];
  const local = new RegExp(re.source, re.flags);
  let current;
  while ((current = local.exec(str)) !== null) {
    matches.push(current[1]);
  }
  return matches;
}

export function parseSql(content, relativePath) {
  const tables = new Set([
    ...matchAll(CREATE_TABLE_RE, content),
    ...matchAll(FROM_RE, content),
    ...matchAll(JOIN_RE, content),
    ...matchAll(INSERT_RE, content),
    ...matchAll(UPDATE_RE, content),
  ]);

  const columns = new Set(matchAll(COLUMN_RE, content));

  const imports = [...tables].map((table) => `table:${table}`);

  const declarations = [
    ...[...tables].map((name) => ({ name, kind: 'table' })),
    ...[...columns].map((name) => ({ name, kind: 'column' })),
  ];

  return {
    relativePath,
    imports,
    declarations,
    functionNodes: [],
    metrics: {
      loc: content.split(/\r?\n/).length,
      tableCount: tables.size,
      columnCount: columns.size,
      importCount: tables.size,
    },
    parseError: null,
  };
}
