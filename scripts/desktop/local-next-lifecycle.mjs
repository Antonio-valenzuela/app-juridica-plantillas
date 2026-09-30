// Preload only in the launcher-owned CLI. Invoke Next's own signal handlers
// through private IPC so Windows can stop its nested dev worker gracefully.
process.on('message', message => {
  if (message?.type === 'desktop-close') process.emit('SIGTERM');
});
process.once('disconnect', () => process.emit('SIGTERM'));
