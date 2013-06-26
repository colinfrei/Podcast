angular.module('podcasts.utilities', [])
    .service('utilities', function() {
        return {
            clean_url: function(url) {
                var cleanedUrl;

                if (url.substring(0, 4) != 'http') {
                    cleanedUrl = 'http://' + url;
                } else {
                    cleanedUrl = url;
                }

                return cleanedUrl;
            }
        }
    })
;
