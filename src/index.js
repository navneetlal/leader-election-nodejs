const os = require('node:os')

const amqplib = require('amqplib')
const chokidar = require('chokidar')
const { Etcd3 } = require('etcd3')
const { nanoid } = require('nanoid')

const hostname = os.hostname() + '-' + nanoid(5)

const client = new Etcd3({
  hosts: `http://${process.env.ETCD_HOST ?? 'localhost'}:2379`
});
const election = client.election('service-A');

const folderToWatch = process.env.WATCH_FOLDER ?? './files'
const watcher = chokidar.watch(folderToWatch, {
  ignored: /(^|[\/\\])\../, // ignore dotfiles
  persistent: true
});

const queue = 'tasks';

(async () => {
  const connection = await amqplib.connect(`amqp://${process.env.RABBITMQ_HOST ?? 'localhost'}`);
  const channel = await connection.createChannel()
  await channel.assertQueue(queue)

  const runCampaign = () => {
    console.log(`Running campaign for ${hostname}`)
    const campaign = election.campaign(hostname)
    campaign.on('elected', async () => {
      console.log('I am the leader now....😈')
      watcher
        .on('add', async path => {
          console.log(`File ${path} has been added`)
          channel.sendToQueue(queue, Buffer.from(path))
        })
    });
    campaign.on('error', async error => {
      console.error(error);
      await watcher.close()
      setTimeout(runCampaign, 1000);
    });
  }

  const observeLeader = async () => {
    const observer = await election.observe();
    console.log('The current leader is', observer.leader());
    observer.on('change', leader => console.log('The new leader is', leader));
    observer.on('error', () => {
      setTimeout(observeLeader, 1000);
    });
  }

  channel.consume(queue, (msg) => {
    if (msg !== null) {
      console.log('Received:', msg.content.toString());
      channel.ack(msg);
    } else {
      console.log('Consumer cancelled by server');
    }
  });

  runCampaign()
  await observeLeader()
})()