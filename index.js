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
    let { changelog } = this.config.getContext();

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
