module.exports = {
  apps: [{
    name: 'record-bot',
    script: 'index.js',
    excec_mode: 'fork',
    // Options reference: https://pm2.io/doc/en/runtime/reference/ecosystem-file/

    // define
    // args: '--data-dir /mnt/record',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '2G'
  }]
}
