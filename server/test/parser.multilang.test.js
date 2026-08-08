import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import os from 'os';
import path from 'path';
import { PolyglotParserAgent } from '../src/agents/parser/PolyglotParserAgent.js';

const tempDirs = [];

after(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

test('PolyglotParserAgent parses Python and Go files via tree-sitter worker', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'polyglot-parser-'));
  tempDirs.push(rootDir);

  const pyPath = path.join(rootDir, 'service.py');
  const goPath = path.join(rootDir, 'service.go');

  await mkdir(path.join(rootDir, 'pkg'), { recursive: true });

  await writeFile(
    pyPath,
    [
      'from .pkg import auth',
      'import requests',
      '',
      'class AuthService:',
      '    pass',
      '',
      'async def login(user):',
      '    return user',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    goPath,
    [
      'package service',
      '',
      'import (',
      '  "fmt"',
      '  alias "net/http"',
      ')',
      '',
      'type Service struct {}',
      '',
      'func Handle() {',
      '  fmt.Println("ok")',
      '}',
    ].join('\n'),
    'utf8',
  );

  const parser = new PolyglotParserAgent();

  const result = await parser.process(
    {
      extractedPath: rootDir,
      manifest: [
        { absolutePath: pyPath, relativePath: 'service.py' },
        { absolutePath: goPath, relativePath: 'service.go' },
      ],
    },
    { jobId: 'test-job' },
  );

  assert.equal(result.status, 'success');
  assert.equal(result.data.parsedFiles.length, 2);

  const pyResult = result.data.parsedFiles.find((file) => file.relativePath === 'service.py');
  assert.ok(pyResult);
  assert.equal(pyResult.parseError, null);
  assert.equal(pyResult.imports.includes('requests'), true);
  assert.equal(pyResult.declarations.some((entry) => entry.name === 'login' && entry.kind === 'fn'), true);
  assert.equal(pyResult.declarations.some((entry) => entry.name === 'AuthService' && entry.kind === 'cls'), true);

  const goResult = result.data.parsedFiles.find((file) => file.relativePath === 'service.go');
  assert.ok(goResult);
  assert.equal(goResult.parseError, null);
  assert.deepEqual(goResult.imports, ['fmt', 'net/http']);
  assert.equal(goResult.declarations.some((entry) => entry.name === 'Handle' && entry.kind === 'fn'), true);
  assert.equal(goResult.declarations.some((entry) => entry.name === 'Service' && entry.kind === 'type'), true);
});

test('PolyglotParserAgent parses Java, Rust, Ruby, C#, Kotlin, and PHP via tree-sitter worker', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'polyglot-parser-'));
  tempDirs.push(rootDir);

  const samples = {
    'Auth.java': [
      'package com.example.auth;',
      '',
      'import com.example.db.UserRepository;',
      '',
      'public class AuthService {',
      '  public boolean login(String user) {',
      '    return true;',
      '  }',
      '}',
      '',
      'interface Authenticator {',
      '  boolean check(String token);',
      '}',
    ].join('\n'),

    'lib.rs': [
      'use std::collections::HashMap;',
      'use crate::db::Connection;',
      '',
      'pub struct Service {',
      '  pub name: String,',
      '}',
      '',
      'pub enum Status {',
      '  Ok,',
      '  Failed,',
      '}',
      '',
      'pub fn handle_request(req: &str) -> bool {',
      '  true',
      '}',
    ].join('\n'),

    'auth_service.rb': [
      "require 'json'",
      '',
      'class AuthService',
      '  def login(user)',
      '    true',
      '  end',
      'end',
    ].join('\n'),

    'AuthService.cs': [
      'using System;',
      '',
      'public class AuthService {',
      '  public bool Login(string user) {',
      '    return true;',
      '  }',
      '}',
      '',
      'public interface IAuthenticator {',
      '  bool Check(string token);',
      '}',
    ].join('\n'),

    'AuthService.kt': [
      'import com.example.db.UserRepository',
      '',
      'class AuthService {',
      '  fun login(user: String): Boolean {',
      '    return true',
      '  }',
      '}',
    ].join('\n'),

    // Regression coverage: PHP class methods are `method_declaration` nodes,
    // distinct from free-standing `function_definition` nodes. A query that
    // only captures the latter silently drops every method on every class.
    'AuthService.php': [
      '<?php',
      "include 'db.php';",
      '',
      'class AuthService {',
      '  function login($user) {',
      '    return true;',
      '  }',
      '}',
      '',
      'function standaloneHelper() {',
      '  return 1;',
      '}',
    ].join('\n'),
  };

  const manifest = [];
  for (const [filename, content] of Object.entries(samples)) {
    const absolutePath = path.join(rootDir, filename);
    await writeFile(absolutePath, content, 'utf8');
    manifest.push({ absolutePath, relativePath: filename });
  }

  const parser = new PolyglotParserAgent();
  const result = await parser.process({ extractedPath: rootDir, manifest }, { jobId: 'test-job-multilang' });

  assert.equal(result.status, 'success');
  assert.equal(result.data.parsedFiles.length, 6);

  const byPath = Object.fromEntries(result.data.parsedFiles.map((file) => [file.relativePath, file]));

  for (const filename of Object.keys(samples)) {
    assert.equal(byPath[filename]?.parseError, null, `${filename} should parse without error`);
  }

  assert.equal(byPath['Auth.java'].declarations.some((d) => d.name === 'login' && d.kind === 'fn'), true);
  assert.equal(byPath['Auth.java'].declarations.some((d) => d.name === 'AuthService' && d.kind === 'cls'), true);
  assert.equal(byPath['Auth.java'].imports.includes('com.example.db.UserRepository'), true);

  assert.equal(byPath['lib.rs'].declarations.some((d) => d.name === 'handle_request' && d.kind === 'fn'), true);
  assert.equal(byPath['lib.rs'].declarations.some((d) => d.name === 'Service' && d.kind === 'struct'), true);
  assert.equal(byPath['lib.rs'].declarations.some((d) => d.name === 'Status' && d.kind === 'enum'), true);

  assert.equal(byPath['auth_service.rb'].declarations.some((d) => d.name === 'login' && d.kind === 'fn'), true);
  assert.equal(byPath['auth_service.rb'].declarations.some((d) => d.name === 'AuthService' && d.kind === 'cls'), true);

  assert.equal(byPath['AuthService.cs'].declarations.some((d) => d.name === 'Login' && d.kind === 'fn'), true);
  assert.equal(byPath['AuthService.cs'].declarations.some((d) => d.name === 'IAuthenticator' && d.kind === 'iface'), true);

  assert.equal(byPath['AuthService.kt'].declarations.some((d) => d.name === 'login' && d.kind === 'fn'), true);
  assert.equal(byPath['AuthService.kt'].declarations.some((d) => d.name === 'AuthService' && d.kind === 'cls'), true);

  // The regression this test exists to catch: PHP methods inside a class.
  assert.equal(byPath['AuthService.php'].declarations.some((d) => d.name === 'login' && d.kind === 'fn'), true);
  assert.equal(byPath['AuthService.php'].declarations.some((d) => d.name === 'standaloneHelper' && d.kind === 'fn'), true);
  assert.equal(byPath['AuthService.php'].declarations.some((d) => d.name === 'AuthService' && d.kind === 'cls'), true);

  // Every detected declaration should carry real source (feeds Phase B's RAG chunking).
  for (const filename of Object.keys(samples)) {
    const parsed = byPath[filename];
    assert.ok(parsed.rawContent && parsed.rawContent.length > 0, `${filename} should capture rawContent`);
    assert.ok(parsed.functionNodes.length > 0, `${filename} should produce function nodes`);
    assert.equal(parsed.functionNodes.every((fn) => typeof fn.bodySource === 'string' && fn.bodySource.length > 0), true, `${filename} function nodes should carry bodySource`);
  }
});

test('PolyglotParserAgent extracts intra-file CALLS for tree-sitter languages (not just JS/TS)', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'polyglot-parser-calls-'));
  tempDirs.push(rootDir);

  const samples = {
    'service.py': [
      'import requests',
      '',
      'def helper():',
      '    return requests.get("x")',
      '',
      'def process():',
      '    helper()',
      '    Unrelated()',
    ].join('\n'),

    'Auth.java': [
      'package x;',
      'class AuthService {',
      '  void helper() {}',
      '  void login() {',
      '    helper();',
      '    this.helper();',
      '    new Unrelated();',
      '  }',
      '}',
    ].join('\n'),

    'lib.rs': [
      'fn helper() {}',
      '',
      'fn process() {',
      '  helper();',
      '  std::println!("ok");',
      '}',
    ].join('\n'),

    // Bare, parens-less zero-arg calls in Ruby are syntactically identical to a
    // variable reference at the grammar level (both are a plain `identifier` node),
    // so this is written with explicit call syntax — the supported, common case.
    'auth_service.rb': [
      'class AuthService',
      '  def helper',
      '  end',
      '',
      '  def login',
      '    helper()',
      '  end',
      'end',
    ].join('\n'),

    'AuthService.cs': [
      'public class AuthService {',
      '  void Helper() {}',
      '  void Login() {',
      '    Helper();',
      '    this.Helper();',
      '    Console.WriteLine("ok");',
      '  }',
      '}',
    ].join('\n'),

    'AuthService.kt': [
      'fun helper() {}',
      '',
      'fun process() {',
      '  helper()',
      '  println("ok")',
      '}',
    ].join('\n'),

    'AuthService.php': [
      '<?php',
      'class AuthService {',
      '  function helper() {}',
      '  function login() {',
      '    $this->helper();',
      '    helper();',
      '  }',
      '}',
    ].join('\n'),
  };

  const manifest = [];
  for (const [filename, content] of Object.entries(samples)) {
    const absolutePath = path.join(rootDir, filename);
    await writeFile(absolutePath, content, 'utf8');
    manifest.push({ absolutePath, relativePath: filename });
  }

  const parser = new PolyglotParserAgent();
  const result = await parser.process({ extractedPath: rootDir, manifest }, { jobId: 'test-job-calls' });

  assert.equal(result.status, 'success');
  const byPath = Object.fromEntries(result.data.parsedFiles.map((file) => [file.relativePath, file]));

  function callsOf(filename, fnNames) {
    const fn = byPath[filename].functionNodes.find((f) => fnNames.includes(f.name));
    assert.ok(fn, `expected a function node named one of ${fnNames} in ${filename}`);
    return fn.calls.map((c) => c.toLowerCase());
  }

  assert.equal(callsOf('service.py', ['process']).includes('helper'), true);
  assert.equal(callsOf('service.py', ['process']).includes('unrelated'), false);

  assert.equal(callsOf('Auth.java', ['login']).includes('helper'), true);
  assert.equal(callsOf('Auth.java', ['login']).includes('unrelated'), false);

  assert.equal(callsOf('lib.rs', ['process']).includes('helper'), true);
  assert.equal(callsOf('lib.rs', ['process']).includes('println'), false);

  assert.equal(callsOf('auth_service.rb', ['login']).includes('helper'), true);

  assert.equal(callsOf('AuthService.cs', ['Login', 'login']).includes('helper'), true);
  assert.equal(callsOf('AuthService.cs', ['Login', 'login']).includes('writeline'), false);

  assert.equal(callsOf('AuthService.kt', ['process']).includes('helper'), true);
  assert.equal(callsOf('AuthService.kt', ['process']).includes('println'), false);

  assert.equal(callsOf('AuthService.php', ['login']).includes('helper'), true);
});

test('PolyglotParserAgent excludes self-recursive calls for tree-sitter languages', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'polyglot-parser-recursion-'));
  tempDirs.push(rootDir);

  const filePath = path.join(rootDir, 'fib.py');
  await writeFile(
    filePath,
    ['def fib(n):', '    if n <= 1:', '        return n', '    return fib(n - 1) + fib(n - 2)'].join('\n'),
    'utf8',
  );

  const parser = new PolyglotParserAgent();
  const result = await parser.process(
    { extractedPath: rootDir, manifest: [{ absolutePath: filePath, relativePath: 'fib.py' }] },
    { jobId: 'test-job-recursion' },
  );

  const fn = result.data.parsedFiles[0].functionNodes.find((f) => f.name === 'fib');
  assert.ok(fn);
  assert.equal(fn.calls.includes('fib'), false);
});
