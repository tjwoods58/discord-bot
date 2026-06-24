import { availabilityCommand } from "./availability.js";
import { scheduleCommand } from "./schedule-add.js";
import { teamCommand } from "./team-assign.js";
import { weekCommand } from "./week-advance.js";
import type { Command } from "../types.js";

export const commands: Command[] = [
  teamCommand,
  scheduleCommand,
  weekCommand,
  availabilityCommand,
];
