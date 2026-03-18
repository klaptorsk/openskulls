#!/usr/bin/env bun

import { createProgram } from './cli/index.js'

const program = createProgram()
program.parse()
