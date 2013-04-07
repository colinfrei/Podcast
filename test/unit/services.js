describe('Filter: timeAgo', function() {
    it('should format a number in seconds to "x seconds/minutes/hours ago"', function() {
        var timeAgo, testTime;

        module('podcasts.services');
        inject(function($filter) {
            timeAgo = $filter('timeAgo');
            testTime = new Date().getTime();
        });

        expect(timeAgo(testTime - 45000)).toEqual('just now');
        expect(timeAgo(testTime - 90000)).toEqual('1 minute ago');
        expect(timeAgo(testTime - 260000)).toEqual('4 minutes ago');
        expect(timeAgo(testTime - 4000000)).toEqual('1 hour ago');
        expect(timeAgo(testTime - 38000000)).toEqual('10 hours ago');
        expect(timeAgo(testTime - 90000000)).toEqual('Yesterday');
        expect(timeAgo(testTime - 865000000)).toEqual('2 weeks ago');
        expect(timeAgo(testTime - 3457000000)).toEqual('older than a month');
    });
});

describe('Filter: time', function() {
    it('should format seconds to a time format"', function() {
        module('podcasts.services');
        inject(function($filter) {
            time = $filter('time');
        });

        expect(time(10)).toEqual('10s');
        expect(time(10)).toEqual('10s');
        expect(time(70)).toEqual('70s');
        expect(time(150)).toEqual('2:30');
        expect(time(123)).toEqual('2:03');
        expect(time(3675)).toEqual('1:01:15');
        expect(time(18000)).toEqual('5:00:00');
    });

    //TODO: test skip option. not sure if I want to change how that works though
});

/*
describe('Service: Settings', function() {
    it('should store a new setting to the DB', function() {
        var settingService;

        module('podcasts.services');
        inject(function($service) {
            settingService = $service;
        });

        expect(settingService(10)).toEqual('10s');
        expect(time(10)).toEqual('10s');
        expect(time(70)).toEqual('70s');
        expect(time(150)).toEqual('2:30');
        expect(time(123)).toEqual('2:03');
        expect(time(3675)).toEqual('1:01:15');
        expect(time(18000)).toEqual('5:00:00');
    });
});
*/


describe('Service: Importer', function() {
    var _feeds = function() {
        return {
            add: jasmine.createSpy('add')
        };
    };

    beforeEach(module('podcasts.importer'));
    beforeEach(module('podcasts.services'));
    beforeEach(module(function($provide) {
        $provide.service('feeds', _feeds);
    }));

    it('should parse JSON and pass the URLs to the feeds service', inject(function(feeds, google) {
        google.addFeedsFromJsonResponse(testFixtures.googleReaderSubscriptions);

        expect(feeds.add.calls.length).toEqual(3);
        expect(feeds.add).toHaveBeenCalledWith("http://feeds.5by5.tv/b2w-afterdark");
        expect(feeds.add).toHaveBeenCalledWith("http://pod.drs.ch/heutemorgen_mpx.xml");
        expect(feeds.add).toHaveBeenCalledWith("http://pod.drs.ch/mailbox_mpx.xml");
    }));
});

describe('Service: Feeds', function() {
    var _downloaderBackend = function($q, xmlParser) {
        return {
            downloadXml: function(url) {
                var deferred = $q.defer();
                deferred.resolve(xmlParser.parse(testFixtures.feedXml));

                return deferred.promise;
            }
        };
    },
        _feeditems = function($delegate, $q) {
            return {
                getFeedItemFromXml: $delegate.getFeedItemFromXml,
                add: function(feedObject) {
                    var deferred = $q.defer();
                    deferred.resolve('');

                    return deferred.promise;
                }
            }
        },
        _db = function() {
            return {};
        };

    beforeEach(function() {
        module('podcasts.services');

        module(function($provide) {
            $provide.service('db', _db);
            $provide.decorator('feedItems', _feeditems);
            $provide.service('downloaderBackend', _downloaderBackend);
        });
    });

    it('should save feedItems to DB with correct queued value', inject(function(feeds, feedItems, $rootScope, downloaderBackend) {
        spyOn(downloaderBackend, 'downloadXml').andCallThrough();
        spyOn(feedItems, 'add').andCallThrough();

        feedItem = {id: 1, url: 'http://www.example.com/feed.xml'};
        feeds.downloadItems(feedItem, null);
        $rootScope.$apply();

        expect(downloaderBackend.downloadXml.calls.length).toEqual(1);
        expect(downloaderBackend.downloadXml).toHaveBeenCalledWith('http://www.example.com/feed.xml');


        expect(feedItems.add.calls.length).toEqual(3); //TODO: adjust as per global setting at some point
        expect(feedItems.add).toHaveBeenCalledWith({ guid : 'http://example.org/podcast/1.mp3', title : 'Example Item 1', link : '', date : 1362124800000, description : 'Example Description 1', audioUrl : 'http://example.org/podcast/1.mp3', queued : 1, feedId : 1 });
        expect(feedItems.add).toHaveBeenCalledWith({ guid : 'http://example.org/podcast/2.mp3', title : 'Example Item 2', link : '', date : 1362038400000, description : 'Example Description 2', audioUrl : 'http://example.org/podcast/2.mp3', queued : 0, feedId : 1 });
        expect(feedItems.add).toHaveBeenCalledWith({ guid : 'http://example.org/podcast/3.mp3', title : 'Example Item 3', link : '', date : 1361952000000, description : 'Example Description 3', audioUrl : 'http://example.org/podcast/3.mp3', queued : 0, feedId : 1 });
        expect(feedItems.add).not.toHaveBeenCalledWith({ guid : 'http://example.org/podcast/4.mp3', title : 'Example Item 4', link : '', date : 1361952000000, description : 'Example Description 4', audioUrl : 'http://example.org/podcast/4.mp3', queued : 0, feedId : 1 });
    }));
});