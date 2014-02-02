'use strict';

angular.module('podcasts.models', ['podcasts.database', 'podcasts.utilities'])
    .service('feeds', ['$log', '$q', 'db', 'downloaderBackend', 'xmlParser', 'feedItems', 'utilities', '$rootScope', function($log, $q, db, downloaderBackend, xmlParser, feedItems, utilities, $rootScope) {
        var feeds = [];

        function _add(url) {
            var feedService = this;
            var finishSave = function(newFeed) {
                var promise = db.put("feed", newFeed)
                    .then(function(key) {
                        newFeed.id = key;

                        feedService.feeds.push(newFeed);
                        feedService.downloadItems(newFeed);
                        $rootScope.$broadcast('queueListRefresh');
                    });
            };

            var cleanedUrl = utilities.clean_url(url);

            var promise = downloaderBackend.downloadXml(cleanedUrl);
            promise.then(function(xml) {
                var channelChildren = xml.find('channel').children(),
                    newFeed = {},
                    imageUrl,
                    titles = xml.find('title'),
                    descriptions = xml.find('description');

                newFeed.url = cleanedUrl;
                newFeed.title = angular.element(titles[Object.keys(titles)[0]]).text();
                newFeed.summary = angular.element(descriptions[Object.keys(descriptions)[0]]).text();
                newFeed.nrQueueItems = 1;

                angular.forEach(channelChildren, function(value, key) {
                    if ('itunes:image' === angular.element(value)[0].nodeName.toLowerCase()) {
                        imageUrl = angular.element(value).attr('href');
                    }

                    if ('itunes:author' === angular.element(value)[0].nodeName.toLowerCase()) {
                        newFeed.author = angular.element(value).text();
                    }
                });


                if (imageUrl) {
                    var file = downloaderBackend.downloadFile(imageUrl);
                    file.then(function(fileBlob) {
                        newFeed.image = fileBlob;
                    }).finally(function() {
                        finishSave(newFeed);
                    });
                } else {
                    finishSave(newFeed);
                }

            }, function() {
                $log.warn('Could not fetch XML for feed, adding just URL for now');
                var newFeed = {};
                newFeed.url = cleanedUrl;

                finishSave(newFeed);
            });
        }

        function _get(id) {
            id = parseInt(id, 10);
            var deferred = $q.defer();

            db.getOne("feed", id)
                .then(function(feed) {
                    if (typeof feed.image === 'string') {
                        feed.image = new Blob([feed.image]);
                    }

                    feed.items = [];
                    db.get("feedItem", IDBKeyRange.only(feed.id), "ixFeedId")
                        .then(function(results) {
                            angular.forEach(results, function(item) {
                                feed.items.push(item);
                            });

                            $rootScope.$apply(deferred.resolve(feed));
                        });
                }, function(value) {
                    deferred.reject();
                });

            return deferred.promise;
        }

        function _list($scope) {
            var feeds = this.feeds,
                promise = db.get("feed");

            promise.then(function(results) {
                angular.forEach(results, function(item) {
                    if (typeof item.image === 'string') {
                        item.image = new Blob(
                            [item.image],
                            {type: 'application/octet-stream'}
                        );
                    }

                    feeds.push(item);
                });

                $scope.$apply();
            });
        }

        function _delete(id) {
            $log.info('Deleting feed with ID ' + id);
            feedItems.deleteByFeedId(id);
            db.delete("feed", id);
        }

        function _downloadAllItems() {
            var feedService = this,
                feeds = db.get("feed"),
                deferred = $q.defer();

            feeds.then(function(results) {
                var promises = [];
                angular.forEach(results, function(item) {
                    promises.push(feedService.downloadItems(item));
                });

                deferred.resolve($q.all(promises));
            });

            return deferred.promise;
        }

        function _downloadItems(feed) {
            var getXmlFromUrl = downloaderBackend.downloadXml(feed.url),
                feedItemObjects = [],
                deferred = $q.defer(),
                recountQueueItems = false;

            getXmlFromUrl.then(function(data) {
                var currentFeedItems = feedItems.getByFeedId(feed.id);

                angular.forEach(
                    data.find('item'),
                    function(element, index) {
                        if (index < 3) { //For now, download at most 3 items per feed
                            feedItemObjects.push(feedItems.getFeedItemFromXml(element));
                        }
                    }
                );

                var promise = currentFeedItems.then(function(currentFeedItems) {
                    var promises = [];

                    angular.forEach(feedItemObjects, function(feedItem, index) {
                        var feedItemExists = false;
                        angular.forEach(currentFeedItems, function(currentFeedItem, index) {
                            if (feedItem.guid === currentFeedItem.guid) {
                                feedItemExists = true;
                            }
                        });

                        if (feedItemExists) {
                            return;
                        }

                        feedItem.feedId = feed.id;
                        if (feed.nrQueueItems > index) {
                            feedItem.queued = 1;
                            recountQueueItems = true;
                        } else {
                            feedItem.queued = 0;
                        }

                        promises.push(feedItems.add(feedItem));
                    });

                    return $q.all(promises);
                });

                var returnPromise = promise
                    .finally(function() {
                        if (recountQueueItems) {
                            return _recountQueueItems(feed);
                        }
                    });

                deferred.resolve(returnPromise);
            }, function(reason) {
                deferred.reject(reason);
            });

            return deferred.promise;
        }

        function _recountQueueItems(feed)
        {
            var queuedCount = 0,
                promises = [],
                deferred = $q.defer();

            feedItems.getByFeedId(feed.id)
                .then(function(results) {
                    angular.forEach(feedItems.orderFeedItemsByDate(results), function(item) {
                        if (item.queued === 1 && ++queuedCount > feed.nrQueueItems) {
                            item.queued = 0;

                            promises.push(feedItems.save(item));
                        }
                    });

                    deferred.resolve($q.all(promises));
                });

            return deferred.promise;
        }

        return {
            add: _add,
            get: _get,
            list: _list,
            delete: _delete,
            downloadAllItems: _downloadAllItems,
            downloadItems: _downloadItems
        };
    }])
    .service('feedItems', ['db', '$q', '$rootScope', function(db, $q, $rootScope) {
        function _get(id, onSuccess, onFailure) {
            db.getOne("feedItem", id)
                .then(function(value) {
                    onSuccess(value);
                }, function() {
                    onFailure();
                });
        }

        function _getFeedItemFromXml(xml) {
            var newFeedItem = {},
                searchableXml = angular.element(xml);

            newFeedItem.guid = searchableXml.find('guid').text();
            newFeedItem.title = searchableXml.find('title').text();
            newFeedItem.link = searchableXml.find('link').text();
            newFeedItem.date = Date.parse(searchableXml.find('pubDate').text());
            newFeedItem.description = searchableXml.find('description').text();
            newFeedItem.audioUrl = searchableXml.find('enclosure').attr('url');

            return newFeedItem;
        }

        function _getFeedItemsByFeedId(feedId) {
            return db.get("feedItem", IDBKeyRange.only(feedId), "ixFeedId");
        }

        function _orderFeedItemsByDate(feedItems) {
           return feedItems.sort(function(a, b) {
                a = new Date(a.date);
                b = new Date(b.date);
                return a<b ? 1 : (a>b ? -1 : 0);
            });
        }

        function _delete(feedItemId) {
            db.delete("feedItem", feedItemId);
        }

        function _deleteByFeedId(feedId) {
            _getFeedItemsByFeedId(feedId)
                .then(function(results) {
                    var rebuildQueueList = false;

                    angular.forEach(results, function(item) {
                        if (item.queued > 0) {
                            rebuildQueueList = true;
                        }

                        _delete(item.id);
                    });

                    if (rebuildQueueList) {
                        $rootScope.$broadcast('queueListRefresh');
                    }
                });
        }

        function _add(object) {
            var newFeedItem = {
                    guid: object.guid,
                    feedId: object.feedId,
                    title: object.title,
                    link: object.link,
                    date: object.date,
                    description: object.description,
                    audioUrl: object.audioUrl,
                    queued: object.queued
                };

            // returning promise we received directly
            return db.put("feedItem", newFeedItem);
        }

        function _save(object) {
            var deferred = $q.defer();

            db.put("feedItem", object)
                .then(deferred.resolve);

            return deferred.promise;
        }

        function _getNextInQueue(feedItem) {
            var tempQueueList = { queue: [], addToQueue: function(item) { this.queue.push(item); } },
                deferred = $q.defer();

            _listQueue(tempQueueList, function() {
                var returnNextValue = false,
                    didReturnValue = false;

                angular.forEach(tempQueueList.queue, function(value, key) {
                    if (returnNextValue) {
                        deferred.resolve(value);
                        returnNextValue = false;
                        didReturnValue = true;
                    }

                    if (feedItem.id === value.id) {
                        returnNextValue = true;
                    }
                });

                if (!didReturnValue) {
                    deferred.reject('Could not find next queue item');
                }
            });

            return deferred.promise;
        }

        /**
         * @param queueList
         * @param done
         */
        function _listQueue(queueList, done) {
            db.get("feedItem", IDBKeyRange.only(1), "ixQueued")
                .then(function(results) {
                    angular.forEach(results, function(item) {
                        // This additional check is necessary, since the index doesn't seem to always catch correctly
                        if (item.queued) {
                            queueList.addToQueue(item);
                        }
                    });

                    done();
                });
        }

        function _unQueue(feedItemId) {
            _updateQueueStatus(feedItemId, 0);
        }

        function _addToQueue(feedItemId) {
            _updateQueueStatus(feedItemId, 2);
        }

        function _updateQueueStatus(feedItemId, status) {
            var feedItem = _get(feedItemId, function(feedItem) {
                feedItem.queued = status;

                var promise = db.put("feedItem", feedItem)
                    .then(function() {
                        $rootScope.$broadcast('queueListRefresh');
                    });
            });
        }

        return {
            get: _get,
            getFeedItemFromXml: _getFeedItemFromXml,
            getByFeedId: _getFeedItemsByFeedId,
            delete: _delete,
            deleteByFeedId: _deleteByFeedId,
            add: _add,
            save: _save,
            getNextInQueue: _getNextInQueue,
            unQueue: _unQueue,
            addToQueue: _addToQueue,
            orderFeedItemsByDate: _orderFeedItemsByDate
        };
    }])
;
