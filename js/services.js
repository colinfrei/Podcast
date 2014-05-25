'use strict';

angular.module('podcasts.services', ['podcasts.utilities', 'podcasts.queueList', 'podcasts.models', 'podcasts.player'])
    .service('url', ['$window', function($window) {
        return {
            url: $window.URL || $window.webkitURL,
            createObjectUrl: function(data) {
                return this.url.createObjectURL(data);
            }
        };
    }])
    .service('pageSwitcher', ['$location', '$route', '$log', '$window', function($location, $route, $log, $window) {
        return {
            //TODO: change these getElementById's to something else
            pageSwitcher: $window.document.getElementById('pageSwitcher'),
            pages: ['queue', 'settings', 'feeds'],
            $route: $route,
            currentPage: null,
            backPage: null,
            change: function(current) {
                this.currentPage = current;
                var nextPage = this.getNextPage(this.currentPage);

                angular.element($window.document.getElementById('pageswitch-icon-' + this.currentPage))
                    .addClass('next').removeClass('next1 next2');
                angular.element($window.document.getElementById('pageswitch-icon-' + nextPage))
                    .addClass('next1').removeClass('next next2');
                angular.element($window.document.getElementById('pageswitch-icon-' + this.getNextPage(nextPage)))
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
                    $log.error('no valid route found for pageSwitcher: ' + nextPage);
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
        };
    }])
    .filter('timeAgo', function() {
        return function(timestamp) {
            var diff = ((new Date().getTime()) - (new Date(timestamp).getTime())) / 1000,
                day_diff = Math.floor(diff / 86400);

            return day_diff === 0 && (
                diff < 60 && "just now" ||
                    diff < 120 && "1 minute ago" ||
                    diff < 3600 && Math.floor( diff / 60 ) + " minutes ago" ||
                    diff < 7200 && "1 hour ago" ||
                    diff < 86400 && Math.floor( diff / 3600 ) + " hours ago") ||
                day_diff == 1 && "Yesterday" ||
                day_diff < 7 && day_diff + " days ago" ||
                day_diff < 31 && Math.ceil( day_diff / 7 ) + " weeks ago" ||
                "older than a month";
        };
    })
    .service('downloaderBackend', ['$http', '$q', 'xmlParser', '$rootScope', function($http, $q, xmlParser, $rootScope) {
        function downloadFile(url)
        {
            var deferred = $q.defer();

            $http.get(url, {'responseType': 'blob'})
                .success(function(file) {
                    deferred.resolve(file);
                })
                .error(function() {
                    deferred.reject();
                })
            ;

            return deferred.promise;
        }

        function downloadXml(url)
        {
            var deferred = $q.defer();

            if (url.indexOf("feeds.feedburner.com") != -1) {
                url = url + '?format=xml';
            }

            $rootScope.$apply($http.get(url)
                .success(function(xml) {
                    deferred.resolve(xmlParser.parse(xml));
                })
                .error(function(data, status, headers, config) {
                    deferred.reject('Could not download XML: ' + status);
                })
            );

            return deferred.promise;
        }

        function downloadChunkedFile(url)
        {
            var deferred = $q.defer();

            // first delete all existing chunks for this URL
            db.get("downloadChunk", IDBKeyRange.only(url), "ixUrl")
                .then(function(results) {
                    angular.forEach(results, function(item) {
                        db.delete(item.id);
                    });
                });

            //TODO: not sure if I need to wait until delete is done to start downloading/saving?
            var i = 0;
            $http.get(url, {'responseType': 'moz-chunked-arraybuffer'})
                .then(function() {
                    db.get("downloadChunk", IDBKeyRange.only(url), "ixUrl")
                        .then(function(result) {
                            //TODO: put together file and resolve deferred with it
                            //TODO: not sure if blob or not

                            //deferred.resolve(combinedFile);
                        });
                },
                function(error) {
                    deferred.reject(error);
                },
                function(chunkData) {
                    var data = {
                        url: url,
                        counter: i++,
                        chunk: chunkData
                    };
                    db.put('downloadChunk', data);
                });

            return deferred.promise;
        }

        return {
            downloadFile: downloadFile,
            downloadXml: downloadXml,
            downloadChunkedFile: downloadChunkedFile
        };
    }])
    .service('cleanup', ['db', function(db) {
        var _doCleanup = function() {
            db.get("feedItem")
                .then(function(feedItems) {
                    angular.forEach(feedItems, function(feedItem) {
                        if (_shouldBeDeleted(feedItem)) {
                            db.delete("feedItem", feedItem.id);
                        }
                    })
                });
        };

        var _shouldBeDeleted = function(feedItem) {
            var cutoffDays = 14;
            var cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - cutoffDays);

            if (feedItem.queued = 0) {
                return false;
            }

            if (feedItem.date > cutoffDate) {
                return false;
            }

            return true;
        };

        return {
            doCleanup: _doCleanup
        };
    }]);

angular.module('podcasts.downloader', ['podcasts.settings', 'podcasts.database', 'podcasts.utilities', 'podcasts.models'])
    .service('downloader', ['db', 'url', '$http', 'settings', '$rootScope', 'feedItems', '$log', '$q', function(db, url, $http, settings, $rootScope, feedItems, $log, $q) {
        return {
            allowedToDownload: function(callback) {
                callback(true);

                /*
                 Not sure how to check this...
                 settings.get('downloadOnWifi', function(setting) {
                 if (setting.value) {
                 //TODO: check if we're on wifi
                 callback(false);
                 } else {
                 callback(true);
                 }
                 }, function() {
                 callback(true); // Default value is "allowed" - maybe change this?
                 });
                 */
            },
            downloadAll: function(silent) {
                var downloader = this;
                this.allowedToDownload(function(value) {
                    if (!value) {
                        $log.log('Not Allowed to Download because not on Wifi');
                        if (!angular.isUndefined(silent) && !silent) {
                            alert('not Downloading because not on WiFi'); //TODO: nicer error message?
                        }
                    } else {
                        var itemsToDownload = [];
                        db.get("feedItem", IDBKeyRange.only(1), "ixQueued")
                            .then(function(results) {
                                angular.forEach(results, function(item) {
                                    if (!item.audio && item.audioUrl) {
                                        itemsToDownload.push(item);
                                    }
                                });

                                downloader.downloadFiles(itemsToDownload);
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

                $log.log('downloading File for: ' + item.title);

                $rootScope.$apply(
                    $http.get(item.audioUrl, {'responseType': 'blob'})
                        .success(function(data) {
                            $log.log('downloaded audio file for saving');

                            item.audio = data;
                            item.duration = downloader.getAudioLength(data);

                            feedItems.save(item)
                                .then(function() {
                                    $rootScope.$broadcast('queueListRefresh');
                                });

                            downloader.downloadFiles(itemsToDownload);
                        })
                        .error(function() {
                            $log.warn('Could not download file');
                        })
                );
            },
            downloadFile: function(item)
            {
                var downloader = this,
                    deferred = $q.defer();

                $log.log('downloading File for: ' + item.title);

                $rootScope.$apply(
                    $http.get(item.audioUrl, {'responseType': 'blob'})
                        .success(function(data) {
                            $log.log('downloaded audio file for saving');

                            item.audio = data;
                            item.duration = downloader.getAudioLength(data);

                            feedItems.save(item)
                                .then(function() {
                                    deferred.resolve();

                                    $rootScope.$broadcast('queueListRefresh');
                                });
                        })
                        .error(function() {
                            deferred.reject();
                            $log.warn('Could not download file');
                        })
                );

                return deferred.promise;
            },
            getAudioLength: function(audio) {
                var tmpAudio = new Audio();
                tmpAudio.autoplay = false;
                tmpAudio.muted = true;
                tmpAudio.src = url.createObjectUrl(audio);

                return tmpAudio.duration;
            }
        };
    }]);

angular.module('podcasts.updater', ['podcasts.settings', 'podcasts.alarmManager', 'podcasts.downloader'])
    .run(['update', function(update) {
        //update.checkFeeds();
    }])
    .service('update', ['$log', 'downloader', 'updateFeedsAlarmManager', function($log, downloader, updateFeedsAlarmManager) {
        var checkFeeds = function() {
            $log.info('Running Feed Check');

            update();
            updateFeedsAlarmManager.setAlarm();
        };

        function update() {
            downloader.downloadAll(true);
        }

        return {
            checkFeeds: checkFeeds,
            update: update
        };
    }])
;

angular.module('podcasts.settings', ['podcasts.database'])
    .factory('serverHttpInterceptor', ['$q', 'settings', function($q, settings) {
        var proxyUrl;

        settings.get('proxyUrl').then(function(setting) {
            proxyUrl = setting;
        });

        return {
            'request': function(config) {
                if (config.url.substring(0, 4) === 'http' && proxyUrl.value) {
                    //TODO: could add some sort of version check and throw an error if
                    config.url = proxyUrl.value + '/forward?url=' + encodeURIComponent(config.url);
                }

                return config || $q.when(config);
            }
        };
    }])
    .config(['$httpProvider', function($httpProvider) {
        $httpProvider.interceptors.push('serverHttpInterceptor');
    }])
    .run(['settings', function(settings) {
        settings.init();
    }])
    .service('settings', ['db', '$q', function(db, $q) {
        var settings = {},
            initialized = false,
            waiting = [];

        function _init() {
            db.get("setting")
                .then(function(results) {
                    angular.forEach(results, function(item) {
                        settings[item.name] = item;
                    });

                    initialized = true;

                    for (var i = 0, l = waiting.length; i < l; i++) {
                        waiting[i]();
                    }
                });
        }

        function _set(name, value, key) {
            var setting;

            if (key) {
                setting = {'id': key, 'name': name, 'value': value};
                if (settings[name].id === key) {
                    settings[name] = setting;
                } else {
                    //TODO: name changed, go through all settings and find the setting by id, and adjust it
                }

                db.put("setting", setting);
            } else {
                _get(name).then(function(existing) {
                    if (existing) {
                        _set(existing.name, value, existing.id);
                    } else {
                        setting = {'name': name, 'value': value};
                        db.put("setting", setting);
                    }
                });
                //TODO: get id after inserting into DB
            }
        }

        function _get(name) {
            var deferred = $q.defer();

            if (!initialized) {
                waiting.push(function() {
                    _get(name).then(function(response) {
                        deferred.resolve(response);
                    });
                });
            }

            if (!angular.isUndefined(settings[name])) {
                deferred.resolve(settings[name]);
            } else {
                db.get("setting", IDBKeyRange.only(name), "ixName")
                    .then(function(results) {
                        deferred.resolve(results[0]);
                    }, function() {
                        deferred.reject();
                    });
            }

            return deferred.promise;
        }

        function _setAllValuesInScope(scope) {
            if (angular.isObject(scope.settings.refreshInterval)) { // Took random setting here
                return;
            }

            if (!initialized) {
                waiting.push(function() {
                    _setAllValuesInScope(scope);
                });

                return;
            }

            angular.forEach(settings, function(setting, index) {
                scope.settings[setting.name] = setting;
            });

            scope.$apply(); //TODO: this conflicts with digest when getting to the settings page a second time
        }

        return {
            init: _init,
            set: _set,
            get: _get,
            setAllValuesInScope: _setAllValuesInScope
        };
    }])
;



angular.module('podcasts.importer', ['podcasts.utilities', 'podcasts.services', 'podcasts.models'])
    .service('opml', ['xmlParser', 'feeds', function(xmlParser, feeds) {
        return {
            import: function(xml) {
                angular.forEach(xml.find('outline'), function(value, key) {
                    var element = angular.element(value);
                    if ("rss" != element.attr('type')) {
                        return;
                    }

                    var feedUrl = element.attr('xmlUrl');
                    if (feedUrl) {
                        feeds.add(feedUrl);
                    }
                });
            }
        };
    }])
    .service('google', ['$q', '$http', 'feeds', '$log', function($q, $http, feeds, $log) {
        return {
            import: function(email, password) {
                var google = this;

                this.auth(email,
                        password)
                    .then(function(authId) {
                        return google.fetchSubscriptions(authId);
                    }, function() {
                        //TODO: display error
                    })
                    .then(function(subscriptions) {
                        google.addFeedsFromJsonResponse(subscriptions);
                    })
                ;
            },
            auth: function(email, password) {
                var escapedEmail = encodeURIComponent(email),
                    escapedPassword = encodeURIComponent(password),
                    deferred = $q.defer();

                $http.post(
                    'https://www.google.com/accounts/ClientLogin',
                    'Email=' + escapedEmail + '&Passwd=' + escapedPassword + '&service=reader',
                    {'headers': {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'}}
                ).success(function(response) {
                    response.split(/\r\n|\r|\n/).forEach(function(value, index) {
                        var valueSplit = value.split('=');
                        if ('Auth' === valueSplit[0]) {
                            deferred.resolve(valueSplit[1]);
                        }
                    });
                }).error(function(data, status, headers, config) {
                        $log.log(data, status, headers);
                    deferred.reject();
                });

                return deferred.promise;
            },
            fetchSubscriptions: function(authId) {
                var deferred = $q.defer();

                $http
                    .get(
                        'http://www.google.com/reader/api/0/subscription/list?output=json',
                        {'headers': {'Authorization': 'GoogleLogin auth=' + authId}}
                    )
                    .success(function(json) {
                        deferred.resolve(json);
                    })
                    .error(function(data, status, headers, config) {
                        deferred.reject();
                    })
                ;

                return deferred.promise;
            },
            addFeedsFromJsonResponse: function(json) {
                json.subscriptions.forEach(function(subscription, subscriptionIndex) {
                    if (subscription.categories.length <= 0) {
                        return false;
                    }

                    subscription.categories.forEach(function(category, categoryIndes) {
                        if ("Listen Subscriptions" === category.label) {
                            var feedUrl = subscription.id;
                            if ("feed/" === feedUrl.substring(0, 5)) {
                                feedUrl = feedUrl.substring(5);
                            }

                            feeds.add(feedUrl);
                        }
                    });
                });
            }
        };
    }])
;
angular.module('podcasts.router', [])
    .service('pageChanger', ['$location', function($location) {
        function goToFeed(feedId) {
            $location.path('/feed/' + feedId);
        }

        return {
            goToFeed: goToFeed
        };
    }])
;
