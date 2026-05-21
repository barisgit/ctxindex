#!/usr/bin/env bun
import { runCli } from '../src/main.ts'

process.exitCode = await runCli(process.argv.slice(2))
