const config = require('config');
const os = require('os');
const Docker = require('dockerode');
const stream = require('stream');
const path = require('path');
const serviceHelper = require('./serviceHelper');
const zelcashService = require('./zelcashService');
const log = require('../lib/log');

const docker = new Docker();

const mongoUrl = `mongodb://${config.database.url}:${config.database.port}/`;
const scannedHeightCollection = config.database.zelcash.collections.scannedHeight;
const zelAppsLocalResources = config.database.zelapps.collections.resourcesLocked;

async function dockerListContainers(all, limit, size, filter) {
  const options = {
    all,
    limit,
    size,
    filter,
  };
  const containers = await docker.listContainers(options).catch((error) => {
    throw error;
  });
  return containers;
}

async function dockerListImages() {
  const containers = await docker.listImages().catch((error) => {
    throw error;
  });
  return containers;
}

async function dockerContainerInspect(container) {
  const response = await container.inspect().catch((error) => {
    throw error;
  });
  return response;
}

// TODO needs roding
function dockerPullStream(repoTag, callback) {
  docker.pull(repoTag, (err, mystream) => {
    function onFinished(error, output) {
      if (error) {
        callback(err);
      } else {
        callback(null, output);
      }
    }
    function onProgress(event) {
      console.log(event);
    }
    if (err) {
      callback(err);
    } else {
      docker.modem.followProgress(mystream, onFinished, onProgress);
    }
  });
}

// TODO fixme
function dockerContainerExec(container, cmd, env, callback) {
  try {
    const logStream = new stream.PassThrough();
    let logStreamData = '';
    logStream.on('data', (chunk) => {
      console.log(chunk.toString('utf8'));
      logStreamData += chunk.toString('utf8');
    });
    console.log(cmd);

    container.exec(
      {
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Cmd: cmd,
        Env: env,
        Tty: false,
      },
      (error, exec) => {
        if (error) {
          console.log(error);
          callback(error);
        } else {
          exec.start(
            {
              hijack: true,
              stdin: true,
              stdout: true,
              stderr: true,
            },
            (err, mystream) => {
              if (err) {
                console.log(err);
                callback(err);
              } else {
                try {
                  container.modem.demuxStream(mystream, logStream, logStream);
                  mystream.on('end', () => {
                    logStream.end();
                    callback(null, logStreamData);
                  });

                  setTimeout(() => {
                    mystream.destroy();
                  }, 2000);
                } catch (errr) {
                  throw new Error({
                    message:
                      'An error obtaining log data of an application has occured',
                  });
                }
              }
            },
          );
        }
      },
    );
  } catch (error) {
    throw new Error({
      message: 'An error obtaining log data of an application has occured',
    });
  }
}

function dockerContainerLogs(container, callback) {
  try {
    const logStream = new stream.PassThrough();
    let logStreamData = '';
    logStream.on('data', (chunk) => {
      logStreamData += chunk.toString('utf8');
    });

    container.logs(
      {
        follow: true,
        stdout: true,
        stderr: true,
      },
      (err, mystream) => {
        if (err) {
          callback(err);
        } else {
          try {
            container.modem.demuxStream(mystream, logStream, logStream);
            mystream.on('end', () => {
              logStream.end();
              callback(null, logStreamData);
            });

            setTimeout(() => {
              mystream.destroy();
            }, 2000);
          } catch (error) {
            throw new Error({
              message:
                'An error obtaining log data of an application has occured',
            });
          }
        }
      },
    );
  } catch (error) {
    throw new Error({
      message: 'An error obtaining log data of an application has occured',
    });
  }
}

// TODO needs redoing
function zelAppPull(req, res) {
  let { repotag } = req.params;
  repotag = repotag || req.query.repotag;

  dockerPullStream(repotag, (error, dataLog) => {
    if (error) {
      const errorResponse = serviceHelper.createErrorMessage(
        error.message,
        error.name,
        error.code,
      );
      res.json(errorResponse);
    } else {
      const containerLogResponse = serviceHelper.createDataMessage(dataLog);
      res.json(containerLogResponse);
    }
  });
}

async function listRunningZelApps(req, res) {
  const zelapps = await dockerListContainers(false).catch((error) => {
    const errMessage = serviceHelper.createErrorMessage(
      error.message,
      error.name,
      error.code,
    );
    log.error(error);
    res.json(errMessage);
    throw error;
  });
  const zelappsResponse = serviceHelper.createDataMessage(zelapps);
  return res ? res.json(zelappsResponse) : zelappsResponse;
}

async function listAllZelApps(req, res) {
  const zelapps = await dockerListContainers(true).catch((error) => {
    const errMessage = serviceHelper.createErrorMessage(
      error.message,
      error.name,
      error.code,
    );
    log.error(error);
    res.json(errMessage);
    throw error;
  });
  const zelappsResponse = serviceHelper.createDataMessage(zelapps);
  return res ? res.json(zelappsResponse) : zelappsResponse;
}

async function listZelAppsImages(req, res) {
  const zelapps = await dockerListImages().catch((error) => {
    const errMessage = serviceHelper.createErrorMessage(
      error.message,
      error.name,
      error.code,
    );
    log.error(error);
    res.json(errMessage);
    throw error;
  });
  const zelappsResponse = serviceHelper.createDataMessage(zelapps);
  return res ? res.json(zelappsResponse) : zelappsResponse;
}


async function zelAppStart(req, res) {
  let { container } = req.params;
  container = container || req.query.container;

  const dockerContainer = docker.getContainer(container);

  const zelapp = await dockerContainer.start().catch((error) => {
    const errMessage = serviceHelper.createErrorMessage(
      error.message,
      error.name,
      error.code,
    );
    log.error(error);
    res.json(errMessage);
    throw error;
  });
  const zelappResponse = serviceHelper.createDataMessage(zelapp);
  return res ? res.json(zelappResponse) : zelappResponse;
}

async function zelAppStop(req, res) {
  let { container } = req.params;
  container = container || req.query.container;

  const dockerContainer = docker.getContainer(container);

  const zelapp = await dockerContainer.stop().catch((error) => {
    const errMessage = serviceHelper.createErrorMessage(
      error.message,
      error.name,
      error.code,
    );
    log.error(error);
    res.json(errMessage);
    throw error;
  });
  const zelappResponse = serviceHelper.createDataMessage(zelapp);
  return res ? res.json(zelappResponse) : zelappResponse;
}

async function zelAppRestart(req, res) {
  let { container } = req.params;
  container = container || req.query.container;

  const dockerContainer = docker.getContainer(container);

  const zelapp = await dockerContainer.restart().catch((error) => {
    const errMessage = serviceHelper.createErrorMessage(
      error.message,
      error.name,
      error.code,
    );
    log.error(error);
    res.json(errMessage);
    throw error;
  });
  const zelappResponse = serviceHelper.createDataMessage(zelapp);
  return res ? res.json(zelappResponse) : zelappResponse;
}

async function zelAppKill(req, res) {
  let { container } = req.params;
  container = container || req.query.container;

  const dockerContainer = docker.getContainer(container);

  const zelapp = await dockerContainer.kill().catch((error) => {
    const errMessage = serviceHelper.createErrorMessage(
      error.message,
      error.name,
      error.code,
    );
    log.error(error);
    res.json(errMessage);
    throw error;
  });
  const zelappResponse = serviceHelper.createDataMessage(zelapp);
  return res ? res.json(zelappResponse) : zelappResponse;
}

async function zelAppRemove(req, res) {
  let { container } = req.params;
  container = container || req.query.container;

  const dockerContainer = docker.getContainer(container);

  const zelapp = await dockerContainer.remove().catch((error) => {
    const errMessage = serviceHelper.createErrorMessage(
      error.message,
      error.name,
      error.code,
    );
    log.error(error);
    res.json(errMessage);
    throw error;
  });
  const zelappResponse = serviceHelper.createDataMessage(zelapp);
  return res ? res.json(zelappResponse) : zelappResponse;
}

async function zelAppPause(req, res) {
  let { container } = req.params;
  container = container || req.query.container;

  const dockerContainer = docker.getContainer(container);

  const zelapp = await dockerContainer.pause().catch((error) => {
    const errMessage = serviceHelper.createErrorMessage(
      error.message,
      error.name,
      error.code,
    );
    log.error(error);
    res.json(errMessage);
    throw error;
  });
  const zelappResponse = serviceHelper.createDataMessage(zelapp);
  return res ? res.json(zelappResponse) : zelappResponse;
}

async function zelAppUnpause(req, res) {
  let { container } = req.params;
  container = container || req.query.container;

  const dockerContainer = docker.getContainer(container);

  const zelapp = await dockerContainer.unpause().catch((error) => {
    const errMessage = serviceHelper.createErrorMessage(
      error.message,
      error.name,
      error.code,
    );
    log.error(error);
    res.json(errMessage);
    throw error;
  });
  const zelappResponse = serviceHelper.createDataMessage(zelapp);
  return res ? res.json(zelappResponse) : zelappResponse;
}

async function zelAppTop(req, res) {
  // List processes running inside a container
  let { container } = req.params;
  container = container || req.query.container;

  const dockerContainer = docker.getContainer(container);

  const zelapp = await dockerContainer.top().catch((error) => {
    const errMessage = serviceHelper.createErrorMessage(
      error.message,
      error.name,
      error.code,
    );
    log.error(error);
    res.json(errMessage);
    throw error;
  });
  const zelappResponse = serviceHelper.createDataMessage(zelapp);
  return res ? res.json(zelappResponse) : zelappResponse;
}

function zelAppLog(req, res) {
  let { container } = req.params;
  container = container || req.query.container;

  const dockerContainer = docker.getContainer(container);

  dockerContainerLogs(dockerContainer, (error, dataLog) => {
    if (error) {
      const errorResponse = serviceHelper.createErrorMessage(
        error.message,
        error.name,
        error.code,
      );
      res.json(errorResponse);
    } else {
      const containerLogResponse = serviceHelper.createDataMessage(dataLog);
      res.json(containerLogResponse);
    }
  });
}

async function zelAppInspect(req, res) {
  let { container } = req.params;
  container = container || req.query.container;

  const dockerContainer = docker.getContainer(container);

  const response = await dockerContainerInspect(dockerContainer).catch(
    (error) => {
      const errMessage = serviceHelper.createErrorMessage(
        error.message,
        error.name,
        error.code,
      );
      log.error(error);
      res.json(errMessage);
      throw error;
    },
  );
  const zelappResponse = serviceHelper.createDataMessage(response);
  return res ? res.json(zelappResponse) : zelappResponse;
}

async function zelAppUpdate(req, res) {
  let { container } = req.params;
  container = container || req.query.container;

  let { cpus } = req.params;
  cpus = cpus || req.query.cpus;

  let { memory } = req.params;
  memory = memory || req.query.memory;

  const dockerContainer = docker.getContainer(container);
  const updateCommand = {};
  if (cpus) {
    cpus = serviceHelper.ensureNumber(cpus);
    cpus *= 1e9;
    updateCommand.NanoCPUs = cpus;
    if (Number.isNaN(cpus)) {
      const errMessage = serviceHelper.createErrorMessage('Invalid cpu count');
      return res.json(errMessage);
    }
  }
  // memory in bytes
  if (memory) {
    memory = serviceHelper.ensureNumber(memory);
    updateCommand.memory = memory;
    if (Number.isNaN(memory)) {
      const errMessage = serviceHelper.createErrorMessage(
        'Invalid memory count',
      );
      return res.json(errMessage);
    }
  }

  console.log(updateCommand);

  const response = await dockerContainer.update(updateCommand).catch((error) => {
    const errMessage = serviceHelper.createErrorMessage(
      error.message,
      error.name,
      error.code,
    );
    log.error(error);
    res.json(errMessage);
    throw error;
  });
  const zelappResponse = serviceHelper.createDataMessage(response);
  return res ? res.json(zelappResponse) : zelappResponse;
}

// todo needs post
function zelAppExec(req, res) {
  let { container } = req.params;
  container = container || req.query.container;

  let { cmd } = req.params;
  cmd = cmd || req.query.cmd;

  let { env } = req.params;
  env = env || req.query.env;

  if (cmd) {
    // must be an array
    cmd = serviceHelper.ensureObject(cmd);
  } else {
    cmd = [];
  }

  if (env) {
    // must be an array
    env = serviceHelper.ensureObject(env);
  } else {
    env = [];
  }

  const dockerContainer = docker.getContainer(container);

  dockerContainerExec(dockerContainer, cmd, env, (error, dataLog) => {
    if (error) {
      const errorResponse = serviceHelper.createErrorMessage(
        error.message,
        error.name,
        error.code,
      );
      res.json(errorResponse);
    } else {
      const containerLogResponse = serviceHelper.createDataMessage(dataLog);
      res.json(containerLogResponse);
    }
  });
}

async function zelShareFile(req, res) {
  let { file } = req.params;
  file = file || req.query.file;

  const dirpath = path.join(__dirname, '../../../');
  const filepath = `${dirpath}/ZelApps/ZelShare/${file}`;

  return res.sendFile(filepath);
}

async function zelfluxUsage(req, res) {
  const dbopen = await serviceHelper.connectMongoDb(mongoUrl).catch((error) => {
    const errMessage = serviceHelper.createErrorMessage(error.message, error.name, error.code);
    res.json(errMessage);
    log.error(error);
    throw error;
  });
  const database = dbopen.db(config.database.zelcash.database);
  const query = { generalScannedHeight: { $gte: 0 } };
  const projection = {
    projection: {
      _id: 0,
      generalScannedHeight: 1,
    },
  };
  const result = await serviceHelper.findOneInDatabase(database, scannedHeightCollection, query, projection).catch((error) => {
    dbopen.close();
    log.error(error);
    const errMessage = serviceHelper.createErrorMessage(error.message, error.name, error.code);
    res.json(errMessage);
    throw error;
  });
  if (!result) {
    log.error('Scanning not initiated');
  }
  let explorerHeight = 999999999;
  if (result) {
    explorerHeight = serviceHelper.ensureNumber(result.generalScannedHeight) || 999999999;
  }
  const zelcashGetInfo = await zelcashService.getInfo();
  let zelcashHeight = 1;
  if (zelcashGetInfo.status === 'success') {
    zelcashHeight = zelcashGetInfo.data.blocks;
  } else {
    log.error(zelcashGetInfo.data);
  }
  let cpuCores = 0;
  const cpus = os.cpus();
  if (cpus) {
    cpuCores = cpus.length;
  }
  if (cpuCores > 8) {
    cpuCores = 8;
  }
  let cpuUsage = 0;
  if (explorerHeight < (zelcashHeight - 5)) {
    // Initial scanning is in progress
    cpuUsage += 0.5;
  } else if (explorerHeight < zelcashHeight) {
    cpuUsage += 0.25;
  } else {
    cpuUsage += 0.1; // normal load
  }
  cpuUsage *= cpuCores;

  // load usedResources of zelapps
  const zelappsDatabase = dbopen.db(config.database.zelapps.database);
  const zelappsQuery = { cpu: { $gte: 0 } };
  const zelappsProjection = {
    projection: {
      _id: 0,
      cpu: 1,
    },
  };
  const zelappsResult = await serviceHelper.findOneInDatabase(zelappsDatabase, zelAppsLocalResources, zelappsQuery, zelappsProjection).catch((error) => {
    dbopen.close();
    log.error(error);
    const errMessage = serviceHelper.createErrorMessage(error.message, error.name, error.code);
    res.json(errMessage);
    throw error;
  });
  let zelAppsCpusLocked = 0;
  if (zelappsResult) {
    zelAppsCpusLocked += serviceHelper.ensureNumber(zelappsResult.cpu) || 0;
  }
  cpuUsage += zelAppsCpusLocked;
  let fiveMinUsage = 0;
  const loadavg = os.loadavg();
  if (loadavg) {
    fiveMinUsage = serviceHelper.ensureNumber(loadavg[1]) || 0;
  }
  // if fiveminUsage is greaeter than our cpuUsage, do an average of those numbers;
  const avgOfUsage = ((fiveMinUsage + cpuUsage) / 2).toFixed(8);
  const response = serviceHelper.createDataMessage(avgOfUsage);
  res.json(response);
}

module.exports = {
  dockerListContainers,
  zelAppPull,
  listRunningZelApps,
  listAllZelApps,
  listZelAppsImages,
  zelAppStart,
  zelAppStop,
  zelAppRestart,
  zelAppKill,
  zelAppRemove,
  zelAppPause,
  zelAppUnpause,
  zelAppTop,
  zelAppLog,
  zelAppInspect,
  zelAppUpdate,
  zelAppExec,
  zelShareFile,
  zelfluxUsage,
};
