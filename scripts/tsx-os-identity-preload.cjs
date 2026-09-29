// Temporary process-only workaround for this Windows host where os.userInfo()
// fails with uv_os_get_passwd/ENOMEM. Do not import this from application code.
if (typeof process.geteuid !== 'function') {
  process.geteuid = () => process.env.USERNAME || 'codex';
}
