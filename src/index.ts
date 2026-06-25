import { Command } from 'commander';
import { prWatch } from './commands/pr-watch.js';

const program = new Command();

program
  .name('loops')
  .description('Long-lived on-demand agent loops')
  .version('0.1.0');

program
  .command('pr-watch <pr-url>')
  .description('Watch a GitHub PR for new comments and autonomously action them via pi')
  .action(async (prUrl: string) => {
    await prWatch(prUrl);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
