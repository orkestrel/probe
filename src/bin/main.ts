import { createProbe, createProbeServer } from '@src/server'

createProbeServer(createProbe()).start()
