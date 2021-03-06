'use strict';

/* Controllers */
function FeedListCtrl($scope, feeds, pageSwitcher, $location) {
    $scope.feeds = feeds.feeds = [];
    feeds.list($scope);

    $scope.addFeed = function() {
        feeds.add($scope.newFeedUrl);
    };

    $scope.preFillField = function() {
        if (angular.isUndefined($scope.newFeedUrl) || $scope.newFeedUrl === "") {
            $scope.newFeedUrl = "http://";
        }
    };

    $scope.removePrefillIfNecessary = function() {
        if ($scope.newFeedUrl == "http://") {
            $scope.newFeedUrl = "";
        }
    };

    $scope.goToFeed = function(feedId) {
        $location.path('/feed/' + feedId);
    };

    pageSwitcher.change('feeds');
}

function FeedCtrl($scope, $routeParams, $location, feeds, pageSwitcher, $log, $window) {
    $scope.nrQueueItemsOptions = [1, 2, 3, 4, 5];
    $scope.feed = {};
    // show info at top and items underneath
    feeds.get($routeParams.feedId)
        .then(function(feed) {
            $scope.feed = feed;

        }, function() {
            $log.log('error fetching feed');
        });

    $scope.delete = function(id) {
        //TODO: check we're not playing anything from this feed?
        if ($window.confirm('Are you sure you want to delete this feed?')) {
            feeds.delete(id);

            $location.path('/feeds');
        }
    };

    pageSwitcher.setBack('feeds');
}

function ListItemCtrl($scope, $rootScope, feedItems, downloader, pageChanger)
{
    $scope.downloading = false;

    $scope.playItem = function(id) {
        feedItems.get(id, function(feedItem) {
            $rootScope.$broadcast('playItem', feedItem);
        });
    };

    // TODO: rename this to toggleItemOptions (didn't work on first try)
    $scope.showItemOptions = function() {
        //TODO: close all other options bars
        this.item.showOptions = !this.item.showOptions;
    };

    $scope.addToQueue = function(id) {
        feedItems.addToQueue(id);
    };

    $scope.keepInQueue = function(id) {
        feedItems.addToQueue(id);
    };

    $scope.downloadFile = function(id) {
        $scope.downloading = true;
        var item = this.item;
        hideItemOptions(item);

        feedItems.get(id, function(feedItem) {
            var promise = downloader.downloadFile(feedItem);
            promise.then(function() {
                $scope.downloading = false;
                item.audio = true;
            });
        });
    };

    function hideItemOptions(scopeItem)
    {
        scopeItem.showOptions = false;
    }

    $scope.reDownloadFile = function(id) {
        feedItems.get(id, function(feedItem) {
            feedItem.audio = null;
            downloader.downloadFiles([feedItem]);
        });
    };

    $scope.goToFeed = function(feedId) {
        pageChanger.goToFeed(feedId);
    };

    $scope.removeFromQueue = function(feedItemId) {
        feedItems.unQueue(feedItemId);
    };
}

function QueueListCtrl($scope, $rootScope, pageSwitcher, feedItems, feeds, queueList, cleanup, $q) {
    $scope.queue = queueList.getQueueList();

    $scope.downloadItems = function() {
        var deferred = $q.defer();

        feeds.downloadAllItems(feedItems)
            .finally(function() {
                $rootScope.$broadcast('queueListRefresh');

                deferred.resolve();
                cleanup.doCleanup();
            });

        return deferred.promise;
    };

    pageSwitcher.change('queue');
}

function SettingsCtrl($scope, settings, pageSwitcher, updateFeedsAlarmManager) {
    $scope.refreshIntervalOptions = [
        {name: '10 seconds', value: '10000'},
        {name: '1 hour', value: '3600000'},
        {name: '8 hour', value: '28800000'},
        {name: '1 day', value: '86400000'},
        {name: 'Manually', value: '0'}
    ];
    $scope.settings = {};

    $scope.changeInterval = function() {
        settings.set(
            'refreshInterval',
            $scope.settings.refreshInterval.value,
            $scope.settings.refreshInterval.id
        );

        updateFeedsAlarmManager.changeAlarmInterval();
    };

    $scope.changeDownloadOnWifi = function() {
        settings.set('downloadOnWifi', $scope.settings.downloadOnWifi.value, $scope.settings.downloadOnWifi.id);
    };

    settings.setAllValuesInScope($scope);
    pageSwitcher.change('settings');
}

function PlayerCtrl($scope, player, pageSwitcher)
{
    $scope.nowPlaying = player.nowPlaying;
    $scope.feedItem = player.feedItem;
    $scope.audio = player.audio;
    $scope.playing = player.playing;

    $scope.playPause = function() {
        if (player.playing()) {
            player.pause();
        } else {
            player.play();
        }
    };

    $scope.$on('playItem', function(event, feedItem) {
        player.play(feedItem);
    });

    var lastForwardJump = 0,
        forwardJumpCount = 1;

    $scope.jumpAudioForward = function() {
        var distance = 5;
        if (lastForwardJump > new Date().getTime() - 2000) {
            distance = forwardJumpCount * distance;
            forwardJumpCount++;
        } else {
            forwardJumpCount = 0;
        }

        player.jumpAudio(distance);
    };
    $scope.jumpAudioBack = function(distance) {
        player.jumpAudio(distance);
    };
}

function PageSwitchCtrl($scope, pageSwitcher)
{
    $scope.showingPageSwitchMenu = false;
    $scope.showingFullCurrentInfo = false;
    $scope.showInfoIcon = false;

    $scope.showPageSwitchMenu = function() {
        $scope.showingPageSwitchMenu = true;
        $scope.$apply();
    };

    $scope.changePage = function(newPage) {
        pageSwitcher.goToPage(newPage);
        $scope.showingPageSwitchMenu = false;
    };
    $scope.showBackLink = function() {
        return !!pageSwitcher.backPage;
    };
}

function InfoCtrl(pageSwitcher)
{
    pageSwitcher.change('info');
}

function ImportCtrl($scope, pageSwitcher, google)
{
    $scope.importGoogle = function() {
        google.import($scope.email, $scope.password);
    };

    pageSwitcher.backPage = true;
    pageSwitcher.change('settings');
}



function DevCtrl($scope, downloader, updateFeedsAlarmManager, opml, downloaderBackend, $log, $window, settings, cleanup)
{
    settings.get('proxyUrl').then(function(value) {
        if (value) {
            $scope.proxyUrl = value.value;
        }
    });

    $scope.isWebApp = function() {
        var app = $window.navigator.mozApps.getSelf();
        if (app.type == 'privileged') {
            return false;
        }

        return true;
    };

    $scope.setProxyUrl = function(proxyUrl) {
        if (!proxyUrl) {
            var app = $window.navigator.mozApps.getSelf();
            if (!app.type || app.type == 'web') {
                alert('Proxy url required for web app. See info URL');

                return;
            }
        }

        settings.set(
            'proxyUrl',
            proxyUrl
        );

        $scope.proxyUrl = proxyUrl;
    };

    $scope.downloadFiles = function() {
        downloader.downloadAll();
    };

    $scope.checkForPendingMessage = function() {
        $log.log('Has pending message: ' + $window.navigator.mozHasPendingMessage('alarm'));
    };

    $scope.setAlarmTmp = function() {
        updateFeedsAlarmManager.setAlarm();
    };

    $scope.opmlUrl = 'https://raw.github.com/colinfrei/Podcast/master/podcasts.xml'; //TODO: change
    $scope.importOpmlFromUrl = function() {
        var xmlPromise = downloaderBackend.downloadXml($scope.opmlUrl);

        xmlPromise.then(function(xml) {
            opml.import(xml);
        });
    };

    $scope.deleteOldQueueItems = function() {
        cleanup.doCleanup();
    };
}
