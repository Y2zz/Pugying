// 生产环境由 Electron 从系统安全存储注入；测试使用固定的非生产密钥。
process.env.PLATFORM_CREDENTIAL_SECRET = 'pugying-test-device-secret';
