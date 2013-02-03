'use strict';

/* Services */
angular.module('podcasts.services', ['podcasts.database', 'podcast.directives'])
    .service('downloader2', ['$http', '$q', 'xmlParser', function($http, $q, xmlParser) {
        return {
            downloadFile: function(url) {
                var deferred = $q.defer();

                $http.get(url, {'responseType': 'blob'})
                    .success(function(file) {
                        deferred.resolve(file);
                    })
                    .error(function() {
                        deferred.reject();
                    });

                return deferred.promise;
            },
            downloadXml: function(url) {
                var deferred = $q.defer();

                $http.get(url)
                    .success(function(xml) {
                        deferred.resolve(xmlParser.parse(xml));
                    })
                    .error(function(data, status, headers, config) {
                        deferred.reject();
                    });

                return deferred.promise;
            }
        }
    }])
    .value('queueList', {
        queue: [],
        scope: null,
        init: function(scope) {
            this.scope = scope;
            scope.queue = this.queue = [];

        },
        addToQueue: function(item) {
            this.queue.push(item);
            if (typeof this.scope !== "undefined") {
                this.scope.$apply();
            }
        }
    })
    .service('feedItems', ['db', function(db) {
        return {
            db: db,
            get: function(id, onSuccess, onFailure) {
                this.db.getCursor("feedItem", function(ixDbCursorReq)
                {
                    if(typeof ixDbCursorReq !== "undefined") {
                        ixDbCursorReq.onsuccess = function (e) {
                            var cursor = ixDbCursorReq.result || e.result;
                            if (cursor) {
                                onSuccess(cursor.value);
                            }
                            if (typeof onFailure === 'function') {
                                onFailure();
                            }
                        }
                    }
                }, null, IDBKeyRange.only(id));
            },
            addFromXml: function(xml, feedId, onSuccess) {
                var newFeedItem = {},
                    searchableXml = angular.element(xml);
                newFeedItem.guid = searchableXml.find('guid').text();
                newFeedItem.feedId = feedId;
                newFeedItem.title = searchableXml.find('title').text();
                newFeedItem.link = searchableXml.find('link').text();
                newFeedItem.date = Date.parse(searchableXml.find('pubDate').text());
                newFeedItem.description = searchableXml.find('description').text();
                newFeedItem.audioUrl = searchableXml.find('enclosure').attr('url');
                newFeedItem.queued = 1;

                this.db.put("feedItem", newFeedItem, undefined, function() {
                    onSuccess(newFeedItem);
                });
            },
            getNextInQueue: function(feedItem) {
                var tempQueueList = { queue: [], addToQueue: function(item) { this.queue.push(item); } };
                var nextFeedItem = null;
                this.listQueue(tempQueueList, function() {
                    var returnNextValue = false;
                    angular.forEach(tempQueueList.queue, function(key, value) {
                        if (returnNextValue) {
                            nextFeedItem = value;
                            returnNextValue = false;
                        }
                        if (feedItem.id === value.id) {
                            returnNextValue = true;
                        }
                    });
                });

                return nextFeedItem;
            },
            listQueue: function(queueList, done) {
                this.db.getCursor("feedItem", function(ixDbCursorReq)
                {
                    if(typeof ixDbCursorReq !== "undefined") {
                        ixDbCursorReq.onsuccess = function (e) {
                            var cursor = ixDbCursorReq.result || e.result;
                            if (cursor) {
                                queueList.addToQueue(cursor.value);

                                cursor.continue();
                            } else {
                                if (typeof done === 'function') {
                                    done();
                                }
                            }
                        }
                    }
                }, undefined, IDBKeyRange.only(1), undefined, 'ixQueued');
            },
            list: function($scope) {
                this.db.getCursor("feedItem", function(ixDbCursorReq)
                {
                    if(typeof ixDbCursorReq !== "undefined") {
                        ixDbCursorReq.onsuccess = function (e) {
                            var cursor = ixDbCursorReq.result || e.result;
                            if (cursor) {
                                $scope.queue.push(cursor.value);
                                $scope.$apply();

                                cursor.continue();
                            }
                        }
                    }
                });
            }
        }
    }])
    .service('feeds', ['db', 'downloader2', 'xmlParser', 'feedItems', function(db, downloader2, xmlParser, feedItems) {
        return {
            db: db,
            feeds: [],
            add: function(url) {
                var feedService = this;
                var finishSave = function(newFeed) {
                    db.put("feed", newFeed, undefined, function(key) {
                        newFeed.id = key;

                        feedService.feeds.push(newFeed);
                        feedService.downloadItems(newFeed);
                    });
                };

                // TODO: verify URL format somewhere

                var promise = downloader2.downloadXml(url);
                promise.then(function(xml) {
                    var channelChildren = xml.find('channel').children(),
                        newFeed = {},
                        imageUrl;

                    angular.forEach(channelChildren, function(value, key) {
                        if ('itunes:image' === angular.element(value)[0].nodeName.toLowerCase()) {
                            imageUrl = angular.element(value).attr('href');
                        }

                        if ('itunes:author' === angular.element(value)[0].nodeName.toLowerCase()) {
                            newFeed.author = angular.element(value).text();
                        }
                    });

                    newFeed.url = url;
                    newFeed.title = channelChildren.find('title').text();
                    newFeed.summary = channelChildren.find('description').text();

                    var file = downloader2.downloadFile(imageUrl);
                    file.then(function(fileBlob) {
                        newFeed.image = fileBlob;
                        finishSave(newFeed);
                    }, function() {
                        finishSave(newFeed);
                    });
                }, function() {
                    console.error('Could not fetch XML for feed, adding just URL for now');
                    var newFeed = {};
                    newFeed.url = url;

                    finishSave(newFeed);
                });
            },
            get: function(id, onSuccess, onFailure) {
                id = parseInt(id, 10);
                this.db.getCursor("feed", function(ixDbCursorReq)
                {
                    if(typeof ixDbCursorReq !== "undefined") {
                        ixDbCursorReq.onsuccess = function (e) {
                            var cursor = ixDbCursorReq.result || e.result;
                            if (cursor) {
                                var feed = cursor.value;
                                if (typeof feed.image === 'string') {
                                    feed.image = new Blob([feed.image]);
                                }

                                db.getCursor("feedItem", function(ixDbCursorReq)
                                {
                                    feed.items = [];
                                    if(typeof ixDbCursorReq !== "undefined") {
                                        ixDbCursorReq.onsuccess = function (e) {
                                            var cursor = ixDbCursorReq.result || e.result;
                                            if (cursor) {
                                                feed.items.push(cursor.value);

                                                cursor.continue();
                                            } else {
                                                onSuccess(feed);
                                            }
                                        }
                                    }
                                }, null, IDBKeyRange.only(feed.id), undefined, 'ixFeedId');

                                //onSuccess(cursor.value);
                            } else {
                                onFailure(cursor);
                            }
                        }

                        ixDbCursorReq.onerror = function (e) {
                            onFailure(e);
                        }
                    }
                }, undefined, IDBKeyRange.only(id));
            },
            list: function($scope) {
                var feeds = this.feeds;
                db.getCursor("feed", function(ixDbCursorReq)
                {
                    if(typeof ixDbCursorReq !== "undefined") {
                        ixDbCursorReq.onsuccess = function (e) {
                            var cursor = ixDbCursorReq.result || e.result;
                            if (cursor) {
                                if (typeof cursor.value.image === 'string') {
                                    cursor.value.image = new Blob([cursor.value.image], {type: 'application/octet-stream'});
                                }
                                feeds.push(cursor.value);
                                $scope.$apply();

                                cursor.continue();
                            }
                        }
                    }
                });
            },
            /**
             *
             * @param feedItems
             * @param updateStatus  function that gets called for each item it goes through
             *                      Takes the feedItem as the argument
             */
            downloadAllItems: function(feedItems, updateStatus) {
                var feedService = this;
                db.getCursor("feed", function(ixDbCursorReq)
                {
                    if(typeof ixDbCursorReq !== "undefined") {
                        ixDbCursorReq.onsuccess = function (e) {
                            var cursor = ixDbCursorReq.result || e.result;

                            if (cursor) {
                                feedService.downloadItems(cursor.value, updateStatus);

                                cursor.continue();
                            } else {
                                updateStatus();
                            }
                        }
                    }
                });
            },
            downloadItems: function(feedItem, updateStatus) {
                var promise = downloader2.downloadXml(feedItem.url);
                promise.then(function(data) {
                    angular.forEach(
                        data.find('item'),
                        function(element, index) {
                            if (index < 3) { // TODO: this should be a global setting
                                feedItems.addFromXml(element, feedItem.id, function(item) {
                                    if (typeof updateStatus === 'function') {
                                        updateStatus(item, feedItem);
                                    }
                                });
                            }
                        }
                    );
                });
            }
        }
    }])
    .value('xmlParser', {
        parse: function(data) {
            return angular.element(new window.DOMParser().parseFromString(data, "text/xml"));
        }
    })
    .service('settings', ['db', function(db) {
        return {
            db: db,
            set: function (name, value, key) {
                if (key) {
                    var setting = {'id': key, 'name': name, 'value': value};
                } else {
                    var setting = {'name': name, 'value': value};
                }

                this.db.put("setting", setting);
            },
            get: function (name, onSuccess, onFailure) {
                this.db.getCursor("setting", function(ixDbCursorReq)
                {
                    if(typeof ixDbCursorReq !== "undefined") {
                        ixDbCursorReq.onsuccess = function (e) {
                            var cursor = ixDbCursorReq.result || e.result;
                            if (cursor) {
                                onSuccess(cursor.value);
                            } else {
                                onFailure();
                            }
                        }

                        ixDbCursorReq.onerror = function (e) {
                            onFailure();
                        }
                    }
                }, undefined, IDBKeyRange.only(name), undefined, 'ixName');
            },
            setAllValuesInScope: function(scope) {
                this.db.getCursor("setting", function(ixDbCursorReq)
                {
                    if(typeof ixDbCursorReq !== "undefined") {
                        ixDbCursorReq.onsuccess = function (e) {
                            var cursor = ixDbCursorReq.result || e.result;
                            if (cursor) {
                                scope[cursor.value.name] = cursor.value;
                                scope.$apply();

                                cursor.continue();
                            }
                        }
                    }
                });
            }
        }
    }])
    .service('player', ['db', '$timeout', function(db, $timeout) {
        return {
            db: db,
            audio: angular.element(document.getElementById('audioPlayer')),
            nowPlaying: {position: 0, duration: 0, title: '', description: '', feed: '', date: 0},
            play: function (feedItem, $scope) {
                if (feedItem) {
                    var audioSrc;

                    if (feedItem.audio) {
                        var URL = window.URL || window.webkitURL;
                        audioSrc = URL.createObjectURL(feedItem.audio);
                    } else {
                        audioSrc = feedItem.audioUrl;
                    }

                    this.audio.attr('src', audioSrc);
                    this.updateSong(feedItem, $scope);

                    if (feedItem.position) {
                        this.audio.bind('canplay', function(event) {
                            this.currentTime = feedItem.position;
                        });
                    }
                }
                this.audio[0].play();

                var db = this.db;
                this.audio.bind('pause', function(event) {
                    feedItem.position = Math.floor(event.target.currentTime);
                    db.put("feedItem", feedItem);
                });

                // TODO: add something here for when audio is done to remove from queue and go to next song
                this.audio.bind('ended', function(event) {
                    feedItem.queued = 0;
                    feedItem.position = 0;
                    db.put("feedItem", feedItem);

                    // start next item
                    // get next item from queue
                    play(nextFeedItem, $scope);
                });
            },
            pause: function() {
                this.audio[0].pause();
            },
            playing: function() {
                return !this.audio[0].paused;
            },
            updateSong: function(feedItem, $scope) {
                this.nowPlaying.title = feedItem.title;
                var audio = this.audio[0],
                    player = this;
                $timeout(function() {
                    player.nowPlaying.duration = audio.duration;
                }, 100);
                this.nowPlaying.feedItem = feedItem;
                this.nowPlaying.description = feedItem.description;
                this.nowPlaying.feed = feedItem.feed;
                this.nowPlaying.date = feedItem.date;
                this.updatePosition($scope);
            },
            updatePosition: function($scope) {
                var audio = this.audio[0],
                    player = this;
                setInterval(function() {
                    player.nowPlaying.position = audio.currentTime;
                    $scope.$apply();
                }, 1000);
            }
        }
    }])
    .service('pageSwitcher', ['$location', '$route', function($location, $route) {
        return {
            //TODO: change these getElementById's to something else
            pageSwitcher: document.getElementById('pageSwitcher'),
            pages: ['queue', 'settings', 'feeds'],
            $route: $route,
            currentPage: null,
            backPage: null,
            change: function(current) {
                this.currentPage = current;
                var nextPage = this.getNextPage(this.currentPage);

                angular.element(document.getElementById('pageswitch-icon-' + this.currentPage))
                    .addClass('next').removeClass('next1 next2');
                angular.element(document.getElementById('pageswitch-icon-' + nextPage))
                    .addClass('next1').removeClass('next next2');
                angular.element(document.getElementById('pageswitch-icon-' + this.getNextPage(nextPage)))
                    .addClass('next2').removeClass('next next1');
            },
            setBack: function(backPage) {
                this.backPage = backPage;
            },
            getNextPage: function(current) {
                var nextPage,
                    pages = this.pages,
                    validRoute = false;

                angular.forEach(pages, function(value, key) {
                    if (current === value) {
                        var nextKey = key + 1;
                        if (pages[nextKey]) {
                            nextPage = pages[nextKey];
                        } else {
                            nextPage = pages[0];
                        }
                    }
                });

                angular.forEach(this.$route.routes, function(value, key) {
                    if (key === '/' + nextPage) {
                        validRoute = true;
                    }
                });
                if (!validRoute) {
                    console.error('no valid route found for pageSwitcher: ' + nextPage);
                }

                return nextPage;
            },
            goToPage: function(page) {
                if (!page) {
                    if (this.backPage) {
                        page = this.backPage;
                    } else {
                        page = this.getNextPage(this.currentPage);
                    }
                }
                if (this.backPage) {
                    this.backPage = null;
                }

                $location.path('/'+page);
            }
        }
    }])
    .service('downloader', ['db', '$http', 'settings', function(db, $http, settings) {
        return {
            db: db,
            http: $http,
            settings: settings,
            allowedToDownload: function(result) {
                settings.get('downloadOnWifi', function(setting) {
                    if (setting.value) {
                        // check if we're on wifi
                        result(false);
                    } else {
                        result(true);
                    }
                }, function() {
                    result(true); // Default value is "allowed" - maybe change this?
                });
            },
            downloadAll: function() {
                var downloader = this;
                this.allowedToDownload(function(value) {
                    if (!value) {
                        alert('not Downloading because not on WiFi');
                    } else {
                        var itemsToDownload = [];
                        downloader.db.getCursor("feedItem", function(ixDbCursorReq)
                        {
                            if(typeof ixDbCursorReq !== "undefined") {
                                ixDbCursorReq.onsuccess = function (e) {
                                    var cursor = ixDbCursorReq.result || e.result;

                                    if (cursor) {
                                        if (!cursor.value.audio && cursor.value.audioUrl) {
                                            itemsToDownload.push(cursor.value);
                                        }
                                        cursor.continue();
                                    } else {
                                        downloader.downloadFiles(itemsToDownload);
                                    }
                                }
                            }
                        });
                    }
                });
            },
            downloadFiles: function(itemsToDownload) {
                var item = itemsToDownload.shift(),
                    downloader = this;
                if (!item) {
                    return;
                }

                this.http.get(item.audioUrl, {'responseType': 'blob'}).success(function(data) {
                    item.audio = data;

                    db.put("feedItem", item);

                    downloader.downloadFiles(itemsToDownload);
                });
            }
        };
    }])
    .filter('time', function() {
        return function(input, skip) {
            var seconds, minutes, hours;
            seconds = Math.floor(input);

            if (seconds > 120) {
                minutes = Math.floor(seconds/60);
                seconds = seconds % 60;
            }
            if (minutes > 60) {
                minutes = Math.floor(minutes/60);
                hours = minutes % 60;
            }

            if (hours) {
                return hours + ':' + minutes + ':' + seconds;
            } else if (minutes) {
                return minutes + ':' + seconds;
            } else {
                if (skip) {
                    return seconds;
                }
                return seconds + 's';
            }
        }
    })
    .filter('timeAgo', function() {
        return function(timestamp) {
            var diff = ((new Date().getTime()) - (new Date(timestamp).getTime())) / 1000,
                day_diff = Math.floor(diff / 86400);

            return day_diff == 0 && (
                diff < 60 && "just now" ||
                    diff < 120 && "1 minute ago" ||
                    diff < 3600 && Math.floor( diff / 60 ) + " minutes ago" ||
                    diff < 7200 && "1 hour ago" ||
                    diff < 86400 && Math.floor( diff / 3600 ) + " hours ago") ||
                day_diff == 1 && "Yesterday" ||
                day_diff < 7 && day_diff + " days ago" ||
                day_diff < 31 && Math.ceil( day_diff / 7 ) + " weeks ago" ||
                "older than a month";
        }
    });

angular.module('podcasts.database', [])
    .run(function() {
        var dbConfig = (function () {
            //Create IndexedDB ObjectStore and Indexes via ixDbEz
            ixDbEz.createObjStore("feed", "id", true);
            ixDbEz.createIndex("feed", "ixUrl", "url", true);
            ixDbEz.createObjStore("feedItem", "id", true);
            ixDbEz.createIndex("feedItem", "ixGuid", "guid", true);
            ixDbEz.createIndex("feedItem", "ixFeedId", "feedId");
            ixDbEz.createIndex("feedItem", "ixQueued", "queued");
            ixDbEz.createObjStore("setting", "id", true);
            ixDbEz.createIndex("setting", "ixName", "name", true);
        });

        //Create or Open the local IndexedDB database via ixDbEz
        ixDbEz.startDB("podcastDb", 7, dbConfig, undefined, undefined, false);
    })
    .value('db', ixDbEz);

angular.module('podcasts.updater', [])
    .run(function($timeout) {
        var checkFeeds = function() {
            console.log('TODO: trigger download here');
            $timeout(checkFeeds, 1800000); // run every half an hour
        };

        checkFeeds();
    })
;
