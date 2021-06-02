const { EOL } = require('os');
const fs = require('fs');
const { Plugin } = require('release-it');
const conventionalChangelog = require('conventional-changelog');
const concat = require('concat-stream');
const prependFile = require('prepend-file');

class ConventionalChangelog extends Plugin {
  getInitialOptions(options, namespace) {
    options[namespace].tagName = options.git.tagName;
    return options[namespace];
  }

  async getChangelog(latestVersion) {
    const { version, previousTag, currentTag } = this.getConventionalConfig(latestVersion);
    this.setContext({ version, previousTag, currentTag });
    return this.generateChangelog();
  }

  getConventionalConfig(latestVersion) {
    const { version } = this.getContext();
    const previousTag = this.config.getContext('latestTag');
    const tagTemplate = this.options.tagName || ((previousTag || '').match(/^v/) ? 'v${version}' : '${version}');
    const currentTag = tagTemplate.replace('${version}', version);

    return { version, previousTag, currentTag };
  }

  getChangelogStream(opts = {}) {
    const { version, previousTag, currentTag } = this.getContext();
    const options = Object.assign({}, opts, this.options);
    const context = { version, previousTag, currentTag };
    const debug = this.config.isDebug ? this.debug : null;
    const gitRawCommitsOpts = { debug };
    this.debug('conventionalChangelog', { options, context, gitRawCommitsOpts });
    return conventionalChangelog(options, context, gitRawCommitsOpts);
  }

  generateChangelog(options) {
    return new Promise((resolve, reject) => {
      const resolver = result => resolve(result.toString().trim());
      const changelogStream = this.getChangelogStream(options);
      changelogStream.pipe(concat(resolver));
      changelogStream.on('error', reject);
    });
  }

  async writeChangelog() {
    const { infile } = this.options;

    // regenerate changelog with tags, as they are not available in previous changelog
    let { version, tagName, latestTag} = this.config.getContext();
    this.setContext({version, previousTag: latestTag, currentTag: tagName})
    const changelog = await this.generateChangelog();

    let hasInfile = false;
    try {
      fs.accessSync(infile);
      hasInfile = true;
    } catch (err) {
      this.debug(err);
    }

    if (!hasInfile) {
      changelog = await this.generateChangelog({ releaseCount: 0 });
      this.debug({ changelog });
    }

    await prependFile(infile, changelog + EOL + EOL);

    if (!hasInfile) {
      await this.exec(`git add ${infile}`);
    }
  }

  async beforeRelease() {
    const { infile } = this.options;
    const { isDryRun } = this.config;

    this.log.exec(`Writing changelog to ${infile}`, isDryRun);

    if (infile && !isDryRun) {
      await this.writeChangelog();
    }
  }
}

module.exports = ConventionalChangelog;
