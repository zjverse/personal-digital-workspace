module.exports = {
  apps: [
    {
      name: 'personal-digital-workspace',
      cwd: './backend',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        DATABASE_PATH: 'data/workspace.sqlite'
      },
      max_memory_restart: '512M',
      watch: false
    }
  ]
};
