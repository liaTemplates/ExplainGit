if (!String.prototype.trim) {
    String.prototype.trim = function () {
      return this.replace(/^\s+|\s+$/g,'');
    };
}

if (!Array.isArray) {
    Array.isArray = function (vArg) {
      return Object.prototype.toString.call(vArg) === "[object Array]";
    };
}

if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function (searchElement /*, fromIndex */ ) {
        "use strict";
        if (this == null) {
            throw new TypeError();
        }
        var t = Object(this);
        var len = t.length >>> 0;
        if (len === 0) {
            return -1;
        }
        var n = 0;
        if (arguments.length > 1) {
            n = Number(arguments[1]);
            if (n != n) { // shortcut for verifying if it's NaN
                n = 0;
            } else if (n != 0 && n != Infinity && n != -Infinity) {
                n = (n > 0 || -1) * Math.floor(Math.abs(n));
            }
        }
        if (n >= len) {
            return -1;
        }
        var k = n >= 0 ? n : Math.max(len - Math.abs(n), 0);
        for (; k < len; k++) {
            if (k in t && t[k] === searchElement) {
                return k;
            }
        }
        return -1;
    }
}

function controlBoxFactory() {
    "use strict";

    /**
     * @class ControlBox
     * @constructor
     */
    function ControlBox(config) {
        this.historyView = config.historyView;
        this.originView = config.originView;
        this.initialMessage = config.initialMessage || 'Enter git commands below.';
        this._commandHistory = [];
        this._currentCommand = -1;
        this._tempCommand = '';
        this.rebaseConfig = {}; // to configure branches for rebase
    }

    ControlBox.prototype = {
        init: function(cmds) {
            cmds.map(cmd => this.command(cmd));
        },
        render: function (container) {
            var cBox = this,
                cBoxContainer, log, input;

            cBoxContainer = container.append('div')
                .classed('control-box', true);


            log = cBoxContainer.append('div')
                .classed('log', true);

            input = cBoxContainer.append('input')
                .attr('type', 'text')
                .attr('placeholder', 'enter git command');

            input.on('keyup', function () {
                var e = d3.event;

                switch (e.keyCode) {
                case 13:
                    if (this.value.trim() === '') {
                        break;
                    }

                    cBox._commandHistory.unshift(this.value);
                    cBox._tempCommand = '';
                    cBox._currentCommand = -1;
                    cBox.command(this.value);
                    this.value = '';
                    e.stopImmediatePropagation();
                    break;
                case 38:
                    var previousCommand = cBox._commandHistory[cBox._currentCommand + 1];
                    if (cBox._currentCommand === -1) {
                        cBox._tempCommand = this.value;
                    }

                    if (typeof previousCommand === 'string') {
                        cBox._currentCommand += 1;
                        this.value = previousCommand;
                        this.value = this.value; // set cursor to end
                    }
                    e.stopImmediatePropagation();
                    break;
                case 40:
                    var nextCommand = cBox._commandHistory[cBox._currentCommand - 1];
                    if (typeof nextCommand === 'string') {
                        cBox._currentCommand -= 1;
                        this.value = nextCommand;
                        this.value = this.value; // set cursor to end
                    } else {
                        cBox._currentCommand = -1;
                        this.value = cBox._tempCommand;
                        this.value = this.value; // set cursor to end
                    }
                    e.stopImmediatePropagation();
                    break;
                }
            });

            this.container = cBoxContainer;
            this.log = log;
            this.input = input;

            this.info(this.initialMessage);
        },

        destroy: function () {
            this.log.remove();
            this.input.remove();
            this.container.remove();

            for (var prop in this) {
                if (this.hasOwnProperty(prop)) {
                    this[prop] = null;
                }
            }
        },

        _scrollToBottom: function () {
            var log = this.log.node();
            log.scrollTop = log.scrollHeight;
        },

        command: function (entry) {
            if (entry.trim === '') {
                return;
            }

            var split = entry.split(' ');

            this.log.append('div')
                .classed('command-entry', true)
                .html(entry);

            this._scrollToBottom();

            if (split[0] !== 'git') {
                return this.error();
            }

            var method = split[1],
                args = split.slice(2);

            try {
                if (typeof this[method] === 'function') {
                    this[method](args);
                } else {
                    this.error();
                }
            } catch (ex) {
                var msg = (ex && ex.message) ? ex.message: null;
                this.error(msg);
            }
        },

        info: function (msg) {
            this.log.append('div').classed('info', true).html(msg);
            this._scrollToBottom();
        },

        error: function (msg) {
            msg = msg || 'I don\'t understand that.';
            this.log.append('div').classed('error', true).html(msg);
            this._scrollToBottom();
        },

        commit: function (args) {
            if (args.length >= 2) {
                var arg = args.shift();

                switch (arg) {
                    case '-m':
                        var message = args.join(" ");
                        this.historyView.commit({},message);
                        break;
                    default:
                        this.historyView.commit();
                        break;
                }
            } else {
                this.historyView.commit();
            }
        },

        branch: function (args) {
            if (args.length < 1) {
                this.info(
                    'You need to give a branch name. ' +
                    'Normally if you don\'t give a name, ' +
                    'this command will list your local branches on the screen.'
                );

                return;
            }

            while (args.length > 0) {
                var arg = args.shift();

                switch (arg) {
                case '--remote':
                case '-r':
                    this.info(
                        'This command normally displays all of your remote tracking branches.'
                    );
                    args.length = 0;
                    break;
                case '--all':
                case '-a':
                    this.info(
                        'This command normally displays all of your tracking branches, both remote and local.'
                    );
                    break;
                case '--delete':
                case '-d':
                    var name = args.pop();
                    this.historyView.deleteBranch(name);
                    break;
                default:
                    if (arg.charAt(0) === '-') {
                        this.error();
                    } else {
                        var remainingArgs = [arg].concat(args);
                        args.length = 0;
                        this.historyView.branch(remainingArgs.join(' '));
                    }
                }
            }
        },

        checkout: function (args) {
            while (args.length > 0) {
                var arg = args.shift();

                switch (arg) {
                case '-b':
                    var name = args[args.length - 1];
                    try {
                        this.historyView.branch(name);
                    } catch (err) {
                        if (err.message.indexOf('already exists') === -1) {
                            throw new Error(err.message);
                        }
                    }
                    break;
                default:
                    var remainingArgs = [arg].concat(args);
                    args.length = 0;
                    this.historyView.checkout(remainingArgs.join(' '));
                }
            }
        },

        tag: function (args) {
            if (args.length < 1) {
                this.info(
                    'You need to give a tag name. ' +
                    'Normally if you don\'t give a name, ' +
                    'this command will list your local tags on the screen.'
                );

                return;
            }
            
            while (args.length > 0) {
                var arg = args.shift();

                try {
                    this.historyView.tag(arg);
                } catch (err) {
                    if (err.message.indexOf('already exists') === -1) {
                        throw new Error(err.message);
                    }
                }
            }
        },

        reset: function (args) {
            while (args.length > 0) {
                var arg = args.shift();

                switch (arg) {
                case '--soft':
                    this.info(
                        'The "--soft" flag works in real git, but ' +
                        'I am unable to show you how it works in this demo. ' +
                        'So I am just going to show you what "--hard" looks like instead.'
                    );
                    break;
                case '--mixed':
                    this.info(
                        'The "--mixed" flag works in real git, but ' +
                        'I am unable to show you how it works in this demo.'
                    );
                    break;
                case '--hard':
                    this.historyView.reset(args.join(' '));
                    args.length = 0;
                    break;
                default:
                    var remainingArgs = [arg].concat(args);
                    args.length = 0;
                    this.info('Assuming "--hard".');
                    this.historyView.reset(remainingArgs.join(' '));
                }
            }
        },

        clean: function (args) {
            this.info('Deleting all of your untracked files...');
        },

        revert: function (args) {
            this.historyView.revert(args.shift());
        },

        merge: function (args) {
            var noFF = false;
            var branch = args[0];
            if (args.length === 2)
            {
                if (args[0] === '--no-ff') {
                    noFF = true;
                    branch = args[1];
                } else if (args[1] === '--no-ff') {
                    noFF = true;
                    branch = args[0];
                } else {
                    this.info('This demo only supports the --no-ff switch..');
                }
            }
            var result = this.historyView.merge(branch, noFF);

            if (result === 'Fast-Forward') {
                this.info('You have performed a fast-forward merge.');
            }
        },

        rebase: function (args) {
            var ref = args.shift(),
                result = this.historyView.rebase(ref);

            if (result === 'Fast-Forward') {
                this.info('Fast-forwarded to ' + ref + '.');
            }
        },

        fetch: function () {
            if (!this.originView) {
                throw new Error('There is no remote server to fetch from.');
            }

            var origin = this.originView,
                local = this.historyView,
                remotePattern = /^origin\/([^\/]+)$/,
                rtb, isRTB, fb,
                fetchBranches = {},
                fetchIds = [], // just to make sure we don't fetch the same commit twice
                fetchCommits = [], fetchCommit,
                resultMessage = '';

            // determine which branches to fetch
            for (rtb = 0; rtb < local.branches.length; rtb++) {
                isRTB = remotePattern.exec(local.branches[rtb]);
                if (isRTB) {
                    fetchBranches[isRTB[1]] = 0;
                }
            }

            // determine which commits the local repo is missing from the origin
            for (fb in fetchBranches) {
                if (origin.branches.indexOf(fb) > -1) {
                    fetchCommit = origin.getCommit(fb);

                    var notInLocal = local.getCommit(fetchCommit.id) === null;
                    while (notInLocal) {
                        if (fetchIds.indexOf(fetchCommit.id) === -1) {
                            fetchCommits.unshift(fetchCommit);
                            fetchIds.unshift(fetchCommit.id);
                        }
                        fetchBranches[fb] += 1;
                        fetchCommit = origin.getCommit(fetchCommit.parent);
                        notInLocal = local.getCommit(fetchCommit.id) === null;
                    }
                }
            }

            // add the fetched commits to the local commit data
            for (var fc = 0; fc < fetchCommits.length; fc++) {
                fetchCommit = fetchCommits[fc];
                local.commitData.push({
                    id: fetchCommit.id,
                    parent: fetchCommit.parent,
                    tags: []
                });
            }

            // update the remote tracking branch tag locations
            for (fb in fetchBranches) {
                if (origin.branches.indexOf(fb) > -1) {
                    var remoteLoc = origin.getCommit(fb).id;
                    local.moveTag('origin/' + fb, remoteLoc);
                }

                resultMessage += 'Fetched ' + fetchBranches[fb] + ' commits on ' + fb + '.</br>';
            }

            this.info(resultMessage);

            local.renderCommits();
        },

        pull: function (args) {
            var control = this,
                local = this.historyView,
                currentBranch = local.currentBranch,
                rtBranch = 'origin/' + currentBranch,
                isFastForward = false;

            this.fetch();

            if (!currentBranch) {
                throw new Error('You are not currently on a branch.');
            }

            if (local.branches.indexOf(rtBranch) === -1) {
                throw new Error('Current branch is not set up for pulling.');
            }

            setTimeout(function () {
                try {
                    if (args[0] === '--rebase' || control.rebaseConfig[currentBranch] === 'true') {
                        isFastForward = local.rebase(rtBranch) === 'Fast-Forward';
                    } else {
                        isFastForward = local.merge(rtBranch) === 'Fast-Forward';
                    }
                } catch (error) {
                    control.error(error.message);
                }

                if (isFastForward) {
                    control.info('Fast-forwarded to ' + rtBranch + '.');
                }
            }, 750);
        },

        push: function (args) {
            var control = this,
                local = this.historyView,
                remoteName = args.shift() || 'origin',
                remote = this[remoteName + 'View'],
                branchArgs = args.pop(),
                localRef = local.currentBranch,
                remoteRef = local.currentBranch,
                localCommit, remoteCommit,
                findCommitsToPush,
                isCommonCommit,
                toPush = [];

            if (remoteName === 'history') {
                throw new Error('Sorry, you can\'t have a remote named "history" in this example.');
            }

            if (!remote) {
                throw new Error('There is no remote server named "' + remoteName + '".');
            }

            if (branchArgs) {
                branchArgs = /^([^:]*)(:?)(.*)$/.exec(branchArgs);

                branchArgs[1] && (localRef = branchArgs[1]);
                branchArgs[2] === ':' && (remoteRef = branchArgs[3]);
            }

            if (local.branches.indexOf(localRef) === -1) {
                throw new Error('Local ref: ' + localRef + ' does not exist.');
            }

            if (!remoteRef) {
                throw new Error('No remote branch was specified to push to.');
            }

            localCommit = local.getCommit(localRef);
            remoteCommit = remote.getCommit(remoteRef);

            findCommitsToPush = function findCommitsToPush(localCommit) {
                var commitToPush,
                    isCommonCommit = remote.getCommit(localCommit.id) !== null;

                while (!isCommonCommit) {
                    commitToPush = {
                        id: localCommit.id,
                        parent: localCommit.parent,
                        tags: []
                    };

                    if (typeof localCommit.parent2 === 'string') {
                        commitToPush.parent2 = localCommit.parent2;
                        findCommitsToPush(local.getCommit(localCommit.parent2));
                    }

                    toPush.unshift(commitToPush);
                    localCommit = local.getCommit(localCommit.parent);
                    isCommonCommit = remote.getCommit(localCommit.id) !== null;
                }
            };

            // push to an existing branch on the remote
            if (remoteCommit && remote.branches.indexOf(remoteRef) > -1) {
                if (!local.isAncestor(remoteCommit.id, localCommit.id)) {
                    throw new Error('Push rejected. Non fast-forward.');
                }

                isCommonCommit = localCommit.id === remoteCommit.id;

                if (isCommonCommit) {
                    return this.info('Everything up-to-date.');
                }

                findCommitsToPush(localCommit);

                remote.commitData = remote.commitData.concat(toPush);
                remote.moveTag(remoteRef, toPush[toPush.length - 1].id);
                remote.renderCommits();
            } else {
                this.info('Sorry, creating new remote branches is not supported yet.');
            }
        },

        config: function (args) {
            var path = args.shift().split('.');

            if (path[0] === 'branch') {
                if (path[2] === 'rebase') {
                    this.rebase[path[1]] = args.pop();
                }
            }
        }
    };

    return ControlBox;
}

function historyViewFactory(d3) {
    "use strict";

    var REG_MARKER_END = 'url(#triangle)',
        MERGE_MARKER_END = 'url(#brown-triangle)',
        FADED_MARKER_END = 'url(#faded-triangle)',

        preventOverlap,
        applyBranchlessClass,
        cx, cy, fixCirclePosition,
        px1, py1, fixPointerStartPosition,
        px2, py2, fixPointerEndPosition,
        fixIdPosition, tagY;

    preventOverlap = function preventOverlap(commit, view) {
        var commitData = view.commitData,
            baseLine = view.baseLine,
            shift = view.commitRadius * 4.5,
            overlapped = null;

        for (var i = 0; i < commitData.length; i++) {
            var c = commitData[i];
            if (c.cx === commit.cx && c.cy === commit.cy && c !== commit) {
                overlapped = c;
                break;
            }
        }

        if (overlapped) {
            var oParent = view.getCommit(overlapped.parent),
                parent = view.getCommit(commit.parent);

            if (overlapped.cy < baseLine) {
                overlapped = oParent.cy < parent.cy ? overlapped : commit;
                overlapped.cy -= shift;
            } else {
                overlapped = oParent.cy > parent.cy ? overlapped : commit;
                overlapped.cy += shift;
            }

            preventOverlap(overlapped, view);
        }
    };

    applyBranchlessClass = function (selection) {
        if (selection.empty()) {
            return;
        }

        selection.classed('branchless', function (d) {
            return d.branchless;
        });

        if (selection.classed('commit-pointer')) {
            selection.attr('marker-end', function (d) {
                return d.branchless ? FADED_MARKER_END : REG_MARKER_END;
            });
        } else if (selection.classed('merge-pointer')) {
            selection.attr('marker-end', function (d) {
                return d.branchless ? FADED_MARKER_END : MERGE_MARKER_END;
            });
        }
    };

    cx = function (commit, view) {
        var parent = view.getCommit(commit.parent),
            parentCX = parent.cx;

        if (typeof commit.parent2 === 'string') {
            var parent2 = view.getCommit(commit.parent2);

            parentCX = parent.cx > parent2.cx ? parent.cx : parent2.cx;
        }

        return parentCX + (view.commitRadius * 4.5);
    };

    cy = function (commit, view) {
        var parent = view.getCommit(commit.parent),
            parentCY = parent.cy || cy(parent, view),
            baseLine = view.baseLine,
            shift = view.commitRadius * 4.5,
            branches = [], // count the existing branches
            branchIndex = 0;

        for (var i = 0; i < view.commitData.length; i++) {
            var d = view.commitData[i];

            if (d.parent === commit.parent) {
                branches.push(d.id);
            }
        }

        branchIndex = branches.indexOf(commit.id);

        if (commit.isNoFFBranch === true) {
            branchIndex++;
        }
        if (commit.isNoFFCommit === true) {
            branchIndex--;
        }

        if (parentCY === baseLine) {
            var direction = 1;
            for (var bi = 0; bi < branchIndex; bi++) {
                direction *= -1;
            }

            shift *= Math.ceil(branchIndex / 2);

            return parentCY + (shift * direction);
        }

        if (parentCY < baseLine) {
            return parentCY - (shift * branchIndex);
        } else if (parentCY > baseLine) {
            return parentCY + (shift * branchIndex);
        }
    };

    fixCirclePosition = function (selection) {
        selection
            .attr('cx', function (d) {
                return d.cx;
            })
            .attr('cy', function (d) {
                return d.cy;
            });
    };

    // calculates the x1 point for commit pointer lines
    px1 = function (commit, view, pp) {
        pp = pp || 'parent';

        var parent = view.getCommit(commit[pp]),
            startCX = commit.cx,
            diffX = startCX - parent.cx,
            diffY = parent.cy - commit.cy,
            length = Math.sqrt((diffX * diffX) + (diffY * diffY));

        return startCX - (view.pointerMargin * (diffX / length));
    };

    // calculates the y1 point for commit pointer lines
    py1 = function (commit, view, pp) {
        pp = pp || 'parent';

        var parent = view.getCommit(commit[pp]),
            startCY = commit.cy,
            diffX = commit.cx - parent.cx,
            diffY = parent.cy - startCY,
            length = Math.sqrt((diffX * diffX) + (diffY * diffY));

        return startCY + (view.pointerMargin * (diffY / length));
    };

    fixPointerStartPosition = function (selection, view) {
        selection.attr('x1', function (d) {
            return px1(d, view);
        }).attr('y1', function (d) {
            return py1(d, view);
        });
    };

    px2 = function (commit, view, pp) {
        pp = pp || 'parent';

        var parent = view.getCommit(commit[pp]),
            endCX = parent.cx,
            diffX = commit.cx - endCX,
            diffY = parent.cy - commit.cy,
            length = Math.sqrt((diffX * diffX) + (diffY * diffY));

        return endCX + (view.pointerMargin * 1.2 * (diffX / length));
    };

    py2 = function (commit, view, pp) {
        pp = pp || 'parent';

        var parent = view.getCommit(commit[pp]),
            endCY = parent.cy,
            diffX = commit.cx - parent.cx,
            diffY = endCY - commit.cy,
            length = Math.sqrt((diffX * diffX) + (diffY * diffY));

        return endCY - (view.pointerMargin * 1.2 * (diffY / length));
    };

    fixPointerEndPosition = function (selection, view) {
        selection.attr('x2', function (d) {
            return px2(d, view);
        }).attr('y2', function (d) {
            return py2(d, view);
        });
    };

    fixIdPosition = function (selection, view, delta) {
        selection.attr('x', function (d) {
            return d.cx;
        }).attr('y', function (d) {
            return d.cy + view.commitRadius + delta;
        });
    };

    tagY = function tagY(t, view) {
        var commit = view.getCommit(t.commit),
            commitCY = commit.cy,
            tags = commit.tags,
            tagIndex = tags.indexOf(t.name);

        if (tagIndex === -1) {
            tagIndex = tags.length;
        }

        if (commitCY < (view.baseLine)) {
            return commitCY - 45 - (tagIndex * 25);
        } else {
            return commitCY + 50 + (tagIndex * 25);
        }
    };

    /**
     * @class HistoryView
     * @constructor
     */
    function HistoryView(config) {
        var commitData = config.commitData || [],
            commit;

        for (var i = 0; i < commitData.length; i++) {
            commit = commitData[i];
            !commit.parent && (commit.parent = 'initial');
            !commit.tags && (commit.tags = []);
        }

        this.name = config.name || 'UnnamedHistoryView';
        this.commitData = commitData;

        this.branches = [];
        this.currentBranch = config.currentBranch || 'master';

        this.width = config.width;
        this.height = config.height || 400;
        this.orginalBaseLine = config.baseLine;
        this.baseLine = this.height * (config.baseLine || 0.6);

        this.commitRadius = config.commitRadius || 20;
        this.pointerMargin = this.commitRadius * 1.3;

        this.isRemote = typeof config.remoteName === 'string';
        this.remoteName = config.remoteName;

        this.initialCommit = {
            id: 'initial',
            parent: null,
            cx: -(this.commitRadius * 2),
            cy: this.baseLine
        };
    }

    HistoryView.generateId = function () {
        return Math.floor((1 + Math.random()) * 0x10000000).toString(16).substring(1);
    };

    HistoryView.prototype = {
        /**
         * @method getCommit
         * @param ref {String} the id or a tag name that refers to the commit
         * @return {Object} the commit datum object
         */
        getCommit: function getCommit(ref) {
            var commitData = this.commitData,
                headMatcher = /HEAD(\^+)/.exec(ref),
                matchedCommit = null;

            if (ref === 'initial') {
                return this.initialCommit;
            }

            if (headMatcher) {
                ref = 'HEAD';
            }

            for (var i = 0; i < commitData.length; i++) {
                var commit = commitData[i];
                if (commit === ref) {
                    matchedCommit = commit;
                    break;
                }

                if (commit.id === ref) {
                    matchedCommit = commit;
                    break;
                }

                var matchedTag = function() { 
                    for (var j = 0; j < commit.tags.length; j++) {
                        var tag = commit.tags[j];
                        if (tag === ref) {
                            matchedCommit = commit;
                            return true;
                        }
                        
                        if (tag.indexOf('[') === 0 && tag.indexOf(']') === tag.length - 1) {
                            tag = tag.substring(1, tag.length - 1);
                        }
                        if (tag === ref) {
                            matchedCommit = commit;
                            return true;
                        }
                    }
                }();
                if (matchedTag === true) {
                    break;
                }
            }

            if (headMatcher && matchedCommit) {
                for (var h = 0; h < headMatcher[1].length; h++) {
                    matchedCommit = getCommit.call(this, matchedCommit.parent);
                }
            }

            return matchedCommit;
        },

        /**
         * @method getCircle
         * @param ref {String} the id or a tag name that refers to the commit
         * @return {d3 Selection} the d3 selected SVG circle
         */
        getCircle: function (ref) {
            var circle = this.svg.select('#' + this.name + '-' + ref),
                commit;

            if (circle && !circle.empty()) {
                return circle;
            }

            commit = this.getCommit(ref);

            if (!commit) {
                return null;
            }

            return this.svg.select('#' + this.name + '-' + commit.id);
        },

        getCircles: function () {
            return this.svg.selectAll('circle.commit');
        },

        /**
         * @method render
         * @param container {String} selector for the container to render the SVG into
         */
        render: function (container) {
            var svgContainer, svg;

            svgContainer = container.append('div')
                .classed('svg-container', true)
                .classed('remote-container', this.isRemote);
                
            svg = svgContainer.append('svg:svg');

            svg.attr('id', this.name)
                .attr('width', this.width)
                .attr('height', this.height);

            if (this.isRemote) {
                svg.append('svg:text')
                    .classed('remote-name-display', true)
                    .text(this.remoteName)
                    .attr('x', 10)
                    .attr('y', 25);
            } else {
                svg.append('svg:text')
                    .classed('remote-name-display', true)
                    .text('Local Repository')
                    .attr('x', 10)
                    .attr('y', 25);

                svg.append('svg:text')
                    .classed('current-branch-display', true)
                    .attr('x', 10)
                    .attr('y', 45);
            }

            this.svgContainer = svgContainer;
            this.svg = svg;
            this.arrowBox = svg.append('svg:g').classed('pointers', true);
            this.commitBox = svg.append('svg:g').classed('commits', true);
            this.tagBox = svg.append('svg:g').classed('tags', true);

            this.renderCommits();

            this._setCurrentBranch(this.currentBranch);
        },

        destroy: function () {
            this.svg.remove();
            this.svgContainer.remove();
            clearInterval(this.refreshSizeTimer);

            for (var prop in this) {
                if (this.hasOwnProperty(prop)) {
                    this[prop] = null;
                }
            }
        },

        _calculatePositionData: function () {
            for (var i = 0; i < this.commitData.length; i++) {
                var commit = this.commitData[i];
                commit.cx = cx(commit, this);
                commit.cy = cy(commit, this);
                preventOverlap(commit, this);
            }
        },
        
        _resizeSvg: function() {
            var ele = document.getElementById(this.svg.node().id);
            var container = ele.parentNode;
            var currentWidth = ele.offsetWidth;
            var newWidth;

            if (ele.getBBox().width > container.offsetWidth)
                newWidth = Math.round(ele.getBBox().width);
            else
                newWidth = container.offsetWidth - 5;

            if (currentWidth != newWidth) {
                this.svg.attr('width', newWidth);
                container.scrollLeft = container.scrollWidth;
            }
        },

        renderCommits: function () {
            if (typeof this.height === 'string' && this.height.indexOf('%') >= 0) {
                var perc = this.height.substring(0, this.height.length - 1) / 100.0;
                var baseLineCalcHeight = Math.round(this.svg.node().parentNode.offsetHeight * perc) - 65;
                var newBaseLine = Math.round(baseLineCalcHeight * (this.originalBaseLine || 0.6));
                if (newBaseLine !== this.baseLine) {
                    this.baseLine = newBaseLine;
                    this.initialCommit.cy = newBaseLine;
                    this.svg.attr('height', baseLineCalcHeight);
                }
            }
            this._calculatePositionData();
            this._calculatePositionData(); // do this twice to make sure
            this._renderCircles();
            this._renderPointers();
            this._renderMergePointers();
            this._renderIdLabels();
            this._resizeSvg();
            this.checkout(this.currentBranch);
        },

        _renderCircles: function () {
            var view = this,
                existingCircles,
                newCircles;

            existingCircles = this.commitBox.selectAll('circle.commit')
                .data(this.commitData, function (d) { return d.id; })
                .attr('id', function (d) {
                    return view.name + '-' + d.id;
                })
                .classed('reverted', function (d) {
                    return d.reverted;
                })
                .classed('rebased', function (d) {
                    return d.rebased;
                });

            existingCircles.transition()
                .duration(500)
                .call(fixCirclePosition);

            newCircles = existingCircles.enter()
                .append('svg:circle')
                .attr('id', function (d) {
                    return view.name + '-' + d.id;
                })
                .classed('commit', true)
                .classed('merge-commit', function (d) {
                    return typeof d.parent2 === 'string';
                })
                .call(fixCirclePosition)
                .attr('r', 1)
                .transition("inflate")
                .duration(500)
                .attr('r', this.commitRadius);

        },

        _renderPointers: function () {
            var view = this,
                existingPointers,
                newPointers;

            existingPointers = this.arrowBox.selectAll('line.commit-pointer')
                .data(this.commitData, function (d) { return d.id; })
                .attr('id', function (d) {
                    return view.name + '-' + d.id + '-to-' + d.parent;
                });

            existingPointers.transition()
                .duration(500)
                .call(fixPointerStartPosition, view)
                .call(fixPointerEndPosition, view);

            newPointers = existingPointers.enter()
                .append('svg:line')
                .attr('id', function (d) {
                    return view.name + '-' + d.id + '-to-' + d.parent;
                })
                .classed('commit-pointer', true)
                .call(fixPointerStartPosition, view)
                .attr('x2', function () { return d3.select(this).attr('x1'); })
                .attr('y2', function () {  return d3.select(this).attr('y1'); })
                .attr('marker-end', REG_MARKER_END)
                .transition()
                .duration(500)
                .call(fixPointerEndPosition, view);
        },

        _renderMergePointers: function () {
            var view = this,
                mergeCommits = [],
                existingPointers, newPointers;

            for (var i = 0; i < this.commitData.length; i++) {
                var commit = this.commitData[i];
                if (typeof commit.parent2 === 'string') {
                    mergeCommits.push(commit);
                }
            }

            existingPointers = this.arrowBox.selectAll('polyline.merge-pointer')
                .data(mergeCommits, function (d) { return d.id; })
                .attr('id', function (d) {
                    return view.name + '-' + d.id + '-to-' + d.parent2;
                });

            existingPointers.transition().duration(500)
                .attr('points', function (d) {
                    var p1 = px1(d, view, 'parent2') + ',' + py1(d, view, 'parent2'),
                        p2 = px2(d, view, 'parent2') + ',' + py2(d, view, 'parent2');

                    return [p1, p2].join(' ');
                });

            newPointers = existingPointers.enter()
                .append('svg:polyline')
                .attr('id', function (d) {
                    return view.name + '-' + d.id + '-to-' + d.parent2;
                })
                .classed('merge-pointer', true)
                .attr('points', function (d) {
                    var x1 = px1(d, view, 'parent2'),
                        y1 = py1(d, view, 'parent2'),
                        p1 = x1 + ',' + y1;

                    return [p1, p1].join(' ');
                })
                .attr('marker-end', MERGE_MARKER_END)
                .transition()
                .duration(500)
                .attr('points', function (d) {
                    var points = d3.select(this).attr('points').split(' '),
                        x2 = px2(d, view, 'parent2'),
                        y2 = py2(d, view, 'parent2');

                    points[1] = x2 + ',' + y2;
                    return points.join(' ');
                });
        },

        _renderIdLabels: function () {
            this._renderText('id-label', function (d) { return d.id + '..'; }, 14);
            this._renderText('message-label', function (d) { return d.message; }, 24);
        },

        _renderText: function(className, getText, delta) {
            var view = this,
                existingTexts,
                newtexts;

            existingTexts = this.commitBox.selectAll('text.' + className)
                .data(this.commitData, function (d) { return d.id; })
                .text(getText);

            existingTexts.transition().call(fixIdPosition, view, delta);

            newtexts = existingTexts.enter()
                .insert('svg:text', ':first-child')
                .classed(className, true)
                .text(getText)
                .call(fixIdPosition, view, delta);
        },

        _parseTagData: function () {
            var tagData = [], i,
                headCommit = null;

            for (i = 0; i < this.commitData.length; i++) {
                var c = this.commitData[i];

                for (var t = 0; t < c.tags.length; t++) {
                    var tagName = c.tags[t];
                    if (tagName.toUpperCase() === 'HEAD') {
                        headCommit = c;
                    } else if (this.branches.indexOf(tagName) === -1) {
                        this.branches.push(tagName);
                    }

                    tagData.push({name: tagName, commit: c.id});
                }
            }

            if (!headCommit) {
                headCommit = this.getCommit(this.currentBranch);
                headCommit.tags.push('HEAD');
                tagData.push({name: 'HEAD', commit: headCommit.id});
            }

            // find out which commits are not branchless


            return tagData;
        },

        _markBranchlessCommits: function () {
            var branch, commit, parent, parent2, c, b;

            // first mark every commit as branchless
            for (c = 0; c < this.commitData.length; c++) {
                this.commitData[c].branchless = true;
            }

            for (b = 0; b < this.branches.length; b++) {
                branch = this.branches[b];
                if (branch.indexOf('/') === -1) {
                    commit = this.getCommit(branch);
                    parent = this.getCommit(commit.parent);
                    parent2 = this.getCommit(commit.parent2);

                    commit.branchless = false;

                    while (parent) {
                        parent.branchless = false;
                        parent = this.getCommit(parent.parent);
                    }

                    // just in case this is a merge commit
                    while (parent2) {
                        parent2.branchless = false;
                        parent2 = this.getCommit(parent2.parent);
                    }
                }
            }

            this.svg.selectAll('circle.commit').call(applyBranchlessClass);
            this.svg.selectAll('line.commit-pointer').call(applyBranchlessClass);
            this.svg.selectAll('polyline.merge-pointer').call(applyBranchlessClass);
        },

        renderTags: function () {
            var view = this,
                tagData = this._parseTagData(),
                existingTags, newTags;

            existingTags = this.tagBox.selectAll('g.branch-tag')
                .data(tagData, function (d) { return d.name; });

            existingTags.exit().remove();

            existingTags.select('rect')
                .transition()
                .duration(500)
                .attr('y', function (d) { return tagY(d, view); })
                .attr('x', function (d) {
                    var commit = view.getCommit(d.commit),
                        width = Number(d3.select(this).attr('width'));

                    return commit.cx - (width / 2);
                });

            existingTags.select('text')
                .transition()
                .duration(500)
                .attr('y', function (d) { return tagY(d, view) + 14; })
                .attr('x', function (d) {
                    var commit = view.getCommit(d.commit);
                    return commit.cx;
                });

            newTags = existingTags.enter()
                .append('g')
                .attr('class', function (d) {
                    var classes = 'branch-tag';
                    if (d.name.indexOf('[') === 0 && d.name.indexOf(']') === d.name.length - 1) {
                        classes += ' git-tag';
                    } else if (d.name.indexOf('/') >= 0) {
                        classes += ' remote-branch';
                    } else if (d.name.toUpperCase() === 'HEAD') {
                        classes += ' head-tag';
                    }
                    return classes;
                });

            newTags.append('svg:rect')
                .attr('width', function (d) {
                    return (d.name.length * 6) + 10;
                })
                .attr('height', 20)
                .attr('y', function (d) { return tagY(d, view); })
                .attr('x', function (d) {
                    var commit = view.getCommit(d.commit),
                        width = Number(d3.select(this).attr('width'));

                    return commit.cx - (width / 2);
                });

            newTags.append('svg:text')
                .text(function (d) {
                    if (d.name.indexOf('[') === 0 && d.name.indexOf(']') === d.name.length - 1)
                        return d.name.substring(1, d.name.length - 1); 
                    return d.name; 
                })
                .attr('y', function (d) {
                    return tagY(d, view) + 14;
                })
                .attr('x', function (d) {
                    var commit = view.getCommit(d.commit);
                    return commit.cx;
                });

            this._markBranchlessCommits();
        },

        _setCurrentBranch: function (branch) {
            var display = this.svg.select('text.current-branch-display'),
                text = 'Current Branch: ';

            if (branch && branch.indexOf('/') === -1) {
                text += branch;
                this.currentBranch = branch;
            } else {
                text += ' DETACHED HEAD';
                this.currentBranch = null;
            }

            display.text(text);
        },

        moveTag: function (tag, ref) {
            var currentLoc = this.getCommit(tag),
                newLoc = this.getCommit(ref);

            if (currentLoc) {
                currentLoc.tags.splice(currentLoc.tags.indexOf(tag), 1);
            }

            newLoc.tags.push(tag);
            return this;
        },

        /**
         * @method isAncestor
         * @param ref1
         * @param ref2
         * @return {Boolean} whether or not ref1 is an ancestor of ref2
         */
        isAncestor: function isAncestor(ref1, ref2) {
            var currentCommit = this.getCommit(ref1),
                targetTree = this.getCommit(ref2),
                inTree = false,
                additionalTrees = [];

            if (!currentCommit) {
                return false;
            }

            while (targetTree) {
                if (targetTree.id === currentCommit.id) {
                    inTree = true;
                    targetTree = null;
                } else {
                    if (targetTree.parent2) {
                        additionalTrees.push(targetTree.parent2);
                    }
                    targetTree = this.getCommit(targetTree.parent);
                }
            }

            if (inTree) {
                return true;
            }

            for (var i = 0; i < additionalTrees.length; i++) {
                inTree = isAncestor.call(this, currentCommit, additionalTrees[i]);
                if (inTree) break;
            }

            return inTree;
        },

        commit: function (commit, message) {
            commit = commit || {};

            !commit.id && (commit.id = HistoryView.generateId());
            !commit.tags && (commit.tags = []);

            commit.message = message;
            if (!commit.parent) {
                if (!this.currentBranch) {
                    throw new Error('Not a good idea to make commits while in a detached HEAD state.');
                }

                commit.parent = this.getCommit(this.currentBranch).id;
            }

            this.commitData.push(commit);
            this.moveTag(this.currentBranch, commit.id);

            this.renderCommits();

            this.checkout(this.currentBranch);
            return this;
        },

        branch: function (name) {
            if (!name || name.trim() === '') {
                throw new Error('You need to give a branch name.');
            }

            if (name === 'HEAD') {
                throw new Error('You cannot name your branch "HEAD".');
            }

            if (name.indexOf(' ') > -1) {
                throw new Error('Branch names cannot contain spaces.');
            }

            if (this.branches.indexOf(name) > -1) {
                throw new Error('Branch "' + name + '" already exists.');
            }

            this.getCommit('HEAD').tags.push(name);
            this.renderTags();
            return this;
        },

        tag: function (name) {
            this.branch('[' + name + ']');
        },

        deleteBranch: function (name) {
            var branchIndex,
                commit;

            if (!name || name.trim() === '') {
                throw new Error('You need to give a branch name.');
            }

            if (name === this.currentBranch) {
                throw new Error('Cannot delete the currently checked-out branch.');
            }

            branchIndex = this.branches.indexOf(name);

            if (branchIndex === -1) {
                throw new Error('That branch doesn\'t exist.');
            }

            this.branches.splice(branchIndex, 1);
            commit = this.getCommit(name);
            branchIndex = commit.tags.indexOf(name);

            if (branchIndex > -1) {
                commit.tags.splice(branchIndex, 1);
            }

            this.renderTags();
        },

        checkout: function (ref) {
            var commit = this.getCommit(ref);

            if (!commit) {
                throw new Error('Cannot find commit: ' + ref);
            }

            var previousHead = this.getCircle('HEAD'),
                newHead = this.getCircle(commit.id);

            if (previousHead && !previousHead.empty()) {
                previousHead.classed('checked-out', false);
            }

            this._setCurrentBranch(ref === commit.id ? null : ref);
            this.moveTag('HEAD', commit.id);
            this.renderTags();

            newHead.classed('checked-out', true);

            return this;
        },

        reset: function (ref) {
            var commit = this.getCommit(ref);

            if (!commit) {
                throw new Error('Cannot find ref: ' + ref);
            }

            if (this.currentBranch) {
                this.moveTag(this.currentBranch, commit.id);
                this.checkout(this.currentBranch);
            } else {
                this.checkout(commit.id);
            }

            return this;
        },

        revert: function (ref) {
            var commit = this.getCommit(ref);

            if (!commit) {
                throw new Error('Cannot find ref: ' + ref);
            }

            if (this.isAncestor(commit, 'HEAD')) {
                commit.reverted = true;
                this.commit({reverts: commit.id});
            } else {
                throw new Error(ref + 'is not an ancestor of HEAD.');
            }
        },

        fastForward: function (ref) {
            var targetCommit = this.getCommit(ref);

            if (this.currentBranch) {
                this.moveTag(this.currentBranch, targetCommit.id);
                this.checkout(this.currentBranch);
            } else {
                this.checkout(targetCommit.id);
            }
        },

        merge: function (ref, noFF) {
            var mergeTarget = this.getCommit(ref),
                currentCommit = this.getCommit('HEAD');

            if (!mergeTarget) {
                throw new Error('Cannot find ref: ' + ref);
            }

            if (currentCommit.id === mergeTarget.id) {
                throw new Error('Already up-to-date.');
            } else if (currentCommit.parent2 === mergeTarget.id) {
                throw new Error('Already up-to-date.');
            } else if (noFF === true) {
                var branchStartCommit = this.getCommit(mergeTarget.parent);
                while (branchStartCommit.parent !== currentCommit.id) {
                    branchStartCommit = this.getCommit(branchStartCommit.parent);
                }
                
                branchStartCommit.isNoFFBranch = true;
                
                this.commit({parent2: mergeTarget.id, isNoFFCommit: true});
            } else if (this.isAncestor(currentCommit, mergeTarget)) {
                this.fastForward(mergeTarget);
                return 'Fast-Forward';
            } else {
                this.commit({parent2: mergeTarget.id});
            }
        },

        rebase: function (ref) {
            var rebaseTarget = this.getCommit(ref),
                currentCommit = this.getCommit('HEAD'),
                isCommonAncestor,
                rebaseTreeLoc,
                rebaseMessage,
                toRebase = [], rebasedCommit,
                remainingHusk;

            if (!rebaseTarget) {
                throw new Error('Cannot find ref: ' + ref);
            }

            if (currentCommit.id === rebaseTarget.id) {
                throw new Error('Already up-to-date.');
            } else if (currentCommit.parent2 === rebaseTarget.id) {
                throw new Error('Already up-to-date.');
            }

            isCommonAncestor = this.isAncestor(currentCommit, rebaseTarget);

            if (isCommonAncestor) {
                this.fastForward(rebaseTarget);
                return 'Fast-Forward';
            }

            rebaseTreeLoc = rebaseTarget.id;

            while (!isCommonAncestor) {
                toRebase.unshift(currentCommit);
                currentCommit = this.getCommit(currentCommit.parent);
                isCommonAncestor = this.isAncestor(currentCommit, rebaseTarget);
            }

            for (var i = 0; i < toRebase.length; i++) {
                rebasedCommit = toRebase[i];
                rebaseMessage = rebasedCommit.message;

                remainingHusk = {
                    id: rebasedCommit.id,
                    parent: rebasedCommit.parent,
                    message: rebasedCommit.message,
                    tags: []
                };

                for (var t = 0; t < rebasedCommit.tags.length; t++) {
                    var tagName = rebasedCommit.tags[t];
                    if (tagName !== this.currentBranch && tagName !== 'HEAD') {
                        remainingHusk.tags.unshift(tagName);
                    }
                }

                this.commitData.push(remainingHusk);

                rebasedCommit.parent = rebaseTreeLoc;
                rebaseTreeLoc = HistoryView.generateId()
                rebasedCommit.id = rebaseTreeLoc;
                rebasedCommit.message = rebaseMessage;
                rebasedCommit.tags.length = 0;
                rebasedCommit.rebased = true;
            }

            if (this.currentBranch) {
                rebasedCommit.tags.push(this.currentBranch);
            }

            this.renderCommits();

            if (this.currentBranch) {
                this.checkout(this.currentBranch);
            } else {
                this.checkout(rebasedCommit.id);
            }
        }
    };

    return HistoryView;
}

const cb = controlBoxFactory(d3);
const hb = historyViewFactory(d3);

const explainGit = (function (HistoryView, ControlBox, d3) {
    var prefix = 'ExplainGit',
        openSandBoxes = [],
        open,
        reset,
        explainGit;

    open = function (_args) {
        var args = Object.create(_args),
            name = prefix + args.name,
            containerId = name + '-Container',
            container = d3.select('#' + containerId),
            playground = container.select('.playground-container'),
            historyView, originView = null,
            controlBox;

        container.style('display', 'block');

        args.name = name;
        historyView = new HistoryView(args);

        if (args.originData) {
            originView = new HistoryView({
                name: name + '-Origin',
                width: 300,
                height: 225,
                commitRadius: 15,
                remoteName: 'origin',
                commitData: args.originData
            });

            originView.render(playground);
        }

        controlBox = new ControlBox({
            historyView: historyView,
            originView: originView,
            initialMessage: args.initialMessage
        });

        controlBox.render(playground);
        historyView.render(playground);

        openSandBoxes.push({
            hv: historyView,
            cb: controlBox,
            container: container
        });

        if(_args.cmds)
            controlBox.init(_args.cmds);
    };

    reset = function () {
        for (var i = 0; i < openSandBoxes.length; i++) {
            var osb = openSandBoxes[i];
            osb.hv.destroy();
            osb.cb.destroy();
            osb.container.style('display', 'none');
        }

        openSandBoxes.length = 0;
        d3.selectAll('a.openswitch').classed('selected', false);
    };

    explainGit = {
        HistoryView: HistoryView,
        ControlBox: ControlBox,
        generateId: HistoryView.generateId,
        open: open,
        reset: reset
    };

    window.explainGit = explainGit;

    return explainGit;
})(hb, cb, d3);