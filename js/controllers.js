'use strict';

/* Controllers */
function FeedListCtrl($scope, feeds, pageSwitcher, $location) {
    $scope.feeds = feeds.feeds = [];
    feeds.list($scope);

    $scope.addFeed = function() {
        feeds.add($scope.newFeedUrl);
    };

    $scope.preFillField = function() {
        if (angular.isUndefined($scope.newFeedUrl) || $scope.newFeedUrl == "") {
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

function FeedCtrl($scope, $routeParams, $location, feeds, pageSwitcher, feedItems) {
    $scope.nrQueueItemsOptions = [1, 2, 3, 4, 5];
    $scope.feed = {};
    // show info at top and items underneath
    feeds.get($routeParams.feedId)
        .then(function(feed) {
            $scope.feed = feed;

        }, function() {
            console.log('error fetching feed');
        });

    $scope.delete = function(id) {
        //TODO: check we're not playing anything from this feed?
        if (confirm('Are you sure you want to delete this feed?')) {
            feeds.delete(id);

            $location.path('/feeds');
        }
    };

    $scope.showItemOptions = function(id) {
        angular.forEach($scope.feed.items, function(value, key) {
            if (value.id == id) {
                $scope.feed.items[key].showOptions = !$scope.feed.items[key].showOptions;
            } else {
                $scope.feed.items[key].showOptions = false;
            }
        });
    };

    $scope.addToQueue = function(id) {
        feedItems.addToQueue(id);
    };

    pageSwitcher.setBack('feeds');
}

function QueueListCtrl($scope, $rootScope, pageSwitcher, feedItems, feeds, downloader, queueList, pageChanger) {
    $scope.queue = queueList.getQueueList();

    $scope.$on('queueListRefresh', function(event) {
        $rootScope.$apply(queueList.rebuildList());
    });

    $scope.playItem = function(id) {
        feedItems.get(id, function(feedItem) {
            $rootScope.$broadcast('playItem', feedItem);
        });
    };

    $scope.showItemOptions = function(id) {
        angular.forEach($scope.queue, function(value, key) {
            if (value.id == id) {
                $scope.queue[key].showOptions = !$scope.queue[key].showOptions;
            } else {
                $scope.queue[key].showOptions = false;
            }
        });
    };

    $scope.downloadFile = function(id) {
        feedItems.get(id, function(feedItem) {
            downloader.downloadFiles([feedItem]);
        });
    };

    $scope.removeFromQueue = function(feedItemId) {
        feedItems.unQueue(feedItemId);
    };

    $scope.downloadItems = function(updateStatus) {
        feeds.downloadAllItems(feedItems, function(feedItem, feed) {
            if (feedItem) {
                $scope.queue.push(feedItem);
            }

            updateStatus(feed);
            $scope.$broadcast('queueListRefresh');
        });
    };

    $scope.reDownloadFile = function(id) {
        feedItems.get(id, function(feedItem) {
            feedItem.audio = null;
            downloader.downloadFiles([feedItem]);
        });
    };

    //TODO: extract this to somewhere
    $scope.goToFeed = function(feedId) {
        pageChanger.goToFeed(feedId);
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

function TopBarCtrl($scope, player, pageSwitcher)
{
    $scope.nowPlaying = player.nowPlaying;
    $scope.feedItem = player.feedItem;
    $scope.audio = player.audio;
    $scope.showingPageSwitchMenu = false;
    $scope.showingFullCurrentInfo = false;
    $scope.showInfoIcon = false;
    $scope.playing = player.playing;

    $scope.playPause = function() {
        if (player.playing()) {
            player.pause();
        } else {
            player.play();
        }
    };

    $scope.$on('playItem', function(event, feedItem) {
        player.play(feedItem, $scope);
    });

    $scope.currentInfo = function() {
        $scope.showingFullCurrentInfo = !$scope.showingFullCurrentInfo;

        // TODO: decide if I need to open or close
        // Open
        // uncollapse area
        // fill area with content
          // get currently playing item
          //
    };

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



function DevCtrl($scope, downloader, updateFeedsAlarmManager, opml, downloaderBackend)
{
    $scope.downloadFiles = function() {
        downloader.downloadAll();
    };

    $scope.checkForPendingMessage = function() {
        console.log('Has pending message: ' + navigator.mozHasPendingMessage('alarm'));
    };

    $scope.setAlarmTmp = function() {
        updateFeedsAlarmManager.setAlarm();
    };
    $scope.importColinsOpml = function() {
        var url = 'https://raw.github.com/colinfrei/Podcast/master/podcasts.xml';
        var xmlPromise = downloaderBackend.downloadXml(url);

        xmlPromise.then(function(xml) {
            opml.import(xml);
        });
    }
}