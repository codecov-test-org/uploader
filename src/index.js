const https = require("https");
const zlib = require("zlib");
const superagent = require("superagent");
const { version } = require("../package.json");
const validate = require("./helpers/validate");
const providers = require("./ci_providers");

function generateQuery(queryParams) {
  query = "".concat(
    "branch=",
    queryParams.branch,
    "&commit=",
    queryParams.commit,
    "&build=",
    queryParams.build,
    "&build_url=",
    queryParams.buildURL,
    "&name=",
    queryParams.name,
    "&tag=",
    queryParams.tag,
    "&slug=",
    queryParams.slug,
    "&service=",
    queryParams.service,
    "&flags=",
    queryParams.flags,
    "&pr=",
    queryParams.pr,
    "&job=",
    queryParams.job
  );
  return query;
}

function dryRun(uploadHost, token, query, uploadFile) {
  console.log(`==> Dumping upload file (no upload)`);
  console.log(
    `${uploadHost}/upload/v4?package=uploader-${version}&token=${token}&${query}`
  );
  console.log(uploadFile);
  process.exit();
}

async function main(args) {
  uploadHost = validate.validateURL(args.url) ? args.url : "https://codecov.io";
  token = validate.validateToken(args.token) ? args.token : "";
  console.log(generateHeader(getVersion()));

  let serviceParams;
  for (const provider of providers) {
    if (provider.detect(process.env)) {
      console.log(`Detected ${provider.getServiceName()} as the CI provider.`);
      serviceParams = provider.getServiceParams(process.env, args);
      break;
    }
  }

  if (serviceParams === undefined) {
    console.error("Unable to detect service, please specify manually.");
    process.exit(-1);
  }

  query = generateQuery(serviceParams);

  uploadFile = endNetworkMarker();

  token = args.token || process.env.CODECOV_TOKEN || "";
  const gzippedFile = gzip(uploadFile);

  if (args.dryRun) {
    dryRun(uploadHost, token, query, uploadFile);
  } else {
    const uploadURL = await uploadToCodecov(
      uploadHost,
      token,
      query,
      gzippedFile
    );
    const result = await uploadToCodecovPUT(uploadURL, gzippedFile);
    console.log(result);
  }
}

function parseURLToHostAndPost(url) {
  if (url.match("https://")) {
    return { port: 443, host: url.split("//")[1] };
  } else if (url.match("http://")) {
    return { port: 80, host: url.split("//")[1] };
  }
  throw new Error("Unable to parse upload url.");
}

function gzip(contents) {
  return zlib.gzipSync(contents);
}

async function uploadToCodecovPUT(uploadURL, uploadFile) {
  console.log("Uploading...");

  parts = uploadURL.split("\n");
  putURL = parts[1];
  codecovResultURL = parts[0];

  try {
    result = await superagent
      .put(`${putURL}`)
      .send(uploadFile) // sends a JSON post body
      .set("Content-Type", "application/x-gzip")
      .set("Content-Encoding", "gzip")
      .set("x-amz-acl", "public-read")
      .set("Content-Length", Buffer.byteLength(uploadFile));

    if (result.status === 200) {
      return { status: "success", resultURL: codecovResultURL };
    }
    throw new Error("Error uploading");
  } catch (error) {
    console.error(error);
  }
}

async function uploadToCodecov(uploadURL, token, query, uploadFile) {
  hostAndPort = parseURLToHostAndPost(uploadURL);
  console.log(
    `Pinging Codecov: ${hostAndPort.host}/v4?package=uploader-${version}&token=*******&${query}`
  );

  try {
    result = await superagent
      .post(
        `${uploadHost}/upload/v4?package=uploader-${version}&token=${token}&${query}`
      )
      .send(uploadFile) // sends a JSON post body
      .set("X-Reduced-Redundancy", "false")
      .set("X-Content-Type", "application/x-gzip")
      .set("Content-Length", Buffer.byteLength(uploadFile));

    return result.res.text;
  } catch (error) {
    console.error(error);
  }
}

function generateHeader(version) {
  header = `
     _____          _
    / ____|        | |
   | |     ___   __| | ___  ___ _____   __
   | |    / _ \\ / _\` |/ _ \\/ __/ _ \\ \\ / /
   | |___| (_) | (_| |  __/ (_| (_) \\ V /
    \\_____\\___/ \\__,_|\\___|\\___\\___/ \\_/

  Codecov report uploader ${version}`;
  return header;
}

function getVersion() {
  return version;
}

function endNetworkMarker() {
  return "<<<<<< network\n";
}

module.exports = {
  main,
  getVersion,
  generateQuery,
  generateHeader,
  endNetworkMarker
};
