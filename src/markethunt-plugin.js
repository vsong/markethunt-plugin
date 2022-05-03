// ==UserScript==
// @name         Markethunt plugin for Mousehunt
// @author       Program
// @namespace    https://greasyfork.org/en/users/886222-program
// @license      MIT
// @version      1.3.1
// @description  Adds a price chart and Markethunt integration to the MH marketplace screen.
// @resource     jq_confirm_css https://cdnjs.cloudflare.com/ajax/libs/jquery-confirm/3.3.2/jquery-confirm.min.css
// @resource     jq_toast_css https://cdnjs.cloudflare.com/ajax/libs/jquery-toast-plugin/1.3.2/jquery.toast.min.css
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery-confirm/3.3.2/jquery-confirm.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery-toast-plugin/1.3.2/jquery.toast.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highcharts/9.3.2/highstock.min.js
// @include      https://www.mousehuntgame.com/*
// @grant        GM_addStyle
// @grant        GM_getResourceText
//
// ==/UserScript==

MutationObserver =
    window.MutationObserver ||
    window.WebKitMutationObserver ||
    window.MozMutationObserver;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/*******************************
 * 
 *  Plugin settings  
 * 
 *******************************/

class SettingsController {
    // private static feature too new :(
    // static #settings;
    static settings;

    static {
        let settingsObj = {};

        if (localStorage.markethuntSettings !== undefined) {
            settingsObj = JSON.parse(localStorage.markethuntSettings);
        }

        this.settings = new Proxy(settingsObj, {
            set(obj, prop, value) {
                obj[prop] = value;
                localStorage.markethuntSettings = JSON.stringify(obj);
                return true;
            }
        });
    }

    static getUseLatestSbPriceForIndex() {
        if (this.settings.useLatestSbPriceForIndex === undefined) {
            return false;
        } else {
            return this.settings.useLatestSbPriceForIndex;
        }
    }

    static setUseLatestSbPriceForIndex(value) {
        this.settings.useLatestSbPriceForIndex = value;
    }

    static getStartChartAtZero() {
        if (this.settings.startChartAtZero === undefined) {
            return false;
        } else {
            return this.settings.startChartAtZero;
        }
    }

    static setStartChartAtZero(value) {
        this.settings.startChartAtZero = value;
    }

    static getEnablePortfolioButtons() {
        if (this.settings.enablePortfolioButtons === undefined) {
            return true;
        } else {
            return this.settings.enablePortfolioButtons;
        }
    }

    static setEnablePortfolioButtons(value) {
        this.settings.enablePortfolioButtons = value;
    }
}

function openPluginSettings() {
    $.alert({
        title: 'Markethunt Plugin Settings',
        content: `
            <label for="checkbox-use-latest-sb-price">
                <input id="checkbox-use-latest-sb-price" type="checkbox">
                Use the most recent SB price to calculate the SB Index of an item even if it has not been recently traded
            </label><br>
            <label for="checkbox-start-chart-at-zero">
                <input id="checkbox-start-chart-at-zero" type="checkbox">
                Make the stock chart Y-axis start at 0 gold/SB
            </label><br>
            <label for="checkbox-enable-portfolio-buttons">
                <input id="checkbox-enable-portfolio-buttons" type="checkbox">
                Place "Add to portfolio" buttons in your marketplace history and journal log
            </label>
        `,
        boxWidth: '600px',
        useBootstrap: false,
        closeIcon: true,
        draggable: true,
        onOpen: function(){
            const useLatestSbPriceCheckbox = document.getElementById("checkbox-use-latest-sb-price");
            useLatestSbPriceCheckbox.checked = SettingsController.getUseLatestSbPriceForIndex();
            useLatestSbPriceCheckbox.addEventListener('change', function(event) {
                SettingsController.setUseLatestSbPriceForIndex(event.currentTarget.checked);
            });

            const startChartAtZeroCheckbox = document.getElementById("checkbox-start-chart-at-zero");
            startChartAtZeroCheckbox.checked = SettingsController.getStartChartAtZero();
            startChartAtZeroCheckbox.addEventListener('change', function(event) {
                SettingsController.setStartChartAtZero(event.currentTarget.checked);
            });

            const enablePortfolioButtonsCheckbox = document.getElementById("checkbox-enable-portfolio-buttons");
            enablePortfolioButtonsCheckbox.checked = SettingsController.getEnablePortfolioButtons();
            enablePortfolioButtonsCheckbox.addEventListener('change', function(event) {
                SettingsController.setEnablePortfolioButtons(event.currentTarget.checked);
            });
        }
    });
}

/*******************************
 * 
 *  Chart functions  
 * 
 *******************************/

// chart vars
const UtcTimezone = "T00:00:00+00:00"

// style
const primaryLineColor = "#4f52aa";
const sbiLineColor = "#00c000"
const volumeColor = "#51cda0";

const eventBandColor = "#f2f2f2";
const eventBandFontColor = "#888888"; // recommend to have same or close color as yGridLineColor for visual clarity
const xGridLineColor = "#bbbbbb";
const yGridLineColor = "#aaaaaa";
const yGridLineColorLighter = "#dddddd";
const axisLabelColor = "#444444";
const crosshairColor = "#252525";

const chartFont = "tahoma";

var eventData = [];

function UtcIsoDateToMillis(dateStr) {
    return (new Date(dateStr + UtcTimezone)).getTime();
}

function formatSISuffix(num, decimalPlaces) {
    const suffixes = ["", "K", "M", "B"];
    let order = Math.max(Math.floor(Math.log(num) / Math.log(1000)), 0);
    if (order > suffixes.length - 1) {
        order = suffixes.length - 1;
    }
    let significand = num / Math.pow(1000, order);
    return significand.toFixed(decimalPlaces) + suffixes[order];
}

function eventBand(IsoStrFrom, IsoStrTo, labelText) {
    return {
        from: UtcIsoDateToMillis(IsoStrFrom),
        to: UtcIsoDateToMillis(IsoStrTo),
        color: eventBandColor,
        label: {
            text: labelText,
            rotation: 270,
            textAlign: 'right',
            y: 5, // pixels from top of chart
            x: 4, // fix slight centering issue
            style: {
                color: eventBandFontColor,
                fontSize: '12px',
                fontFamily: chartFont,
            },
        },
    }
}

function updateEventData() {
    $.getJSON(`https://markethunt.vsong.ca/api/get_event_dates.php?plugin_ver=${GM_info.script.version}`, function (response) {
        localStorage.markethuntEventDates = JSON.stringify(response);
        localStorage.markethuntEventDatesLastRetrieval = Date.now();
    });
}

function renderChartWithItemId(itemId, containerId) {
    itemId = Number(itemId);

    if (localStorage.markethuntEventDatesLastRetrieval !== undefined) {
        eventData = [];
        JSON.parse(localStorage.markethuntEventDates).forEach(event => eventData.push(eventBand(event[0], event[1], event[2])));

        if (Date.now() - Number(localStorage.markethuntEventDatesLastRetrieval) > 2 * 86400 * 1000) {
            updateEventData();
        }
    } else {
        updateEventData();
    }

    function renderChart(response) {
        // set stock data HUD
        if (response.data.length > 0) {
            const newestPrice = response.data[response.data.length - 1];
            const utcTodayMillis = UtcIsoDateToMillis(new Date().toISOString().substring(0, 10));

            const priceDisplay = document.getElementById("infoboxPrice");
            const sbIndexDisplay = document.getElementById("infoboxSbPrice");
            const tradeVolDisplay = document.getElementById("infoboxTradevol");
            const goldVolDisplay = document.getElementById("infoboxGoldvol");
            const weeklyVolDisplay = document.getElementById("infobox7dTradevol");
            const weeklyGoldVolDisplay = document.getElementById("infobox7dGoldvol");

            // set gold price
            priceDisplay.innerHTML = newestPrice.price.toLocaleString();

            // set sb price
            try {
                let sbiText = '--';
                let sbIndex = newestPrice.sb_index;
                
                if (SettingsController.getUseLatestSbPriceForIndex()) {
                    sbIndex = newestPrice.price / response.latest_sb_data.price;
                }
                
                if (sbIndex >= 100) {
                    sbiText = Math.round(sbIndex).toLocaleString();
                } else {
                    sbiText = sbIndex.toFixed(2).toLocaleString();
                }
                sbIndexDisplay.innerHTML = sbiText;
            } catch (e) {
                // do nothing
            }

            // set yesterday's trade volume
            let volText = '0';
            if (utcTodayMillis - UtcIsoDateToMillis(newestPrice.date) <= 86400 * 1000 && newestPrice.volume !== null) {
                volText = newestPrice.volume.toLocaleString();
            }
            tradeVolDisplay.innerHTML = volText;

            // set yesterday's gold volume
            let goldVolText = '0';
            if (utcTodayMillis - UtcIsoDateToMillis(newestPrice.date) <= 86400 * 1000 && newestPrice.volume !== null) {
                goldVolText = formatSISuffix(newestPrice.volume * newestPrice.price, 2);
            }
            goldVolDisplay.innerHTML = goldVolText;

            // set last week's trade volume
            let weeklyVolText = response.data.reduce(function(sum, dataPoint) {
                if (utcTodayMillis - UtcIsoDateToMillis(dataPoint.date) <= 7 * 86400 * 1000) {
                    return sum + (dataPoint.volume !== null ? dataPoint.volume : 0);
                } else {
                    return sum;
                }
            }, 0);
            weeklyVolDisplay.innerHTML = weeklyVolText.toLocaleString();

            // set last week's gold volume
            let weeklyGoldVol = response.data.reduce(function(sum, dataPoint) {
                if (utcTodayMillis - UtcIsoDateToMillis(dataPoint.date) <= 7 * 86400 * 1000) {
                    return sum + (dataPoint.volume !== null ? dataPoint.volume * dataPoint.price : 0);
                } else {
                    return sum;
                }
            }, 0);
            weeklyGoldVolDisplay.innerHTML = (weeklyGoldVol === 0) ? '0' : formatSISuffix(weeklyGoldVol, 2);
        }

        // process data for highcharts
        var daily_prices = [];
        var daily_trade_volume = [];
        var sbi = [];
        for (var i = 0; i < response.data.length; i++) {
            daily_prices.push([
                UtcIsoDateToMillis(response.data[i].date),
                Number(response.data[i].price)
            ]);
            daily_trade_volume.push([
                UtcIsoDateToMillis(response.data[i].date),
                Number(response.data[i].volume)
            ]);
            sbi.push([
                UtcIsoDateToMillis(response.data[i].date),
                Number(response.data[i].sb_index)
            ]);
        }

        Highcharts.setOptions({
            chart: {
                style: {
                    fontFamily: chartFont,
                },
                spacingLeft: 0,
                spacingRight: 5,
                spacingTop: 7,
                spacingBottom: 6,
            },
            lang: {
                rangeSelectorZoom :""
            },
            plotOptions: {
                series: {
                    //animation: false,
                    dataGrouping: {
                        enabled: (itemId == 114114) ? true : false,
                        units: [['day', [1]], ['week', [1]]],
                        groupPixelWidth: 2,
                    },
                    showInLegend: true,
                },
            },
            xAxis: {
                // lineColor: '#555',
                tickColor: xGridLineColor,
                // gridLineWidth: 1,
                gridLineColor: xGridLineColor,
                labels: {
                    style: {
                        color: axisLabelColor,
                        fontSize: '11px',
                    }
                }
            },
            yAxis: {
                gridLineColor: yGridLineColor,
                labels: {
                    style: {
                        color: axisLabelColor,
                        fontSize: '11px',
                    },
                    y: 3,
                }
            }
        });

        // Create the chart
        var chart = new Highcharts.stockChart(containerId, {
            // must keep scrollbar enabled for dynamic scrolling, so hide the scrollbar instead
            scrollbar: {
                height: 0,
                buttonArrowColor: "#ffffff00",
            },
            title: {
                enabled: false,
            },
            credits: {
                enabled: false,
            },
            rangeSelector: {
                buttons: [
                    {
                        type: 'month',
                        count: 1,
                        text: '1M'
                    }, {
                        type: 'month',
                        count: 3,
                        text: '3M'
                    }, {
                        type: 'month',
                        count: 6,
                        text: '6M'
                    }, {
                        type: 'year',
                        count: 1,
                        text: '1Y',
                    }, {
                        type: 'all',
                        text: 'All'
                    },
                ],
                buttonPosition: {
                    y: 5,
                },
                inputEnabled: false,
                labelStyle: {
                    color: axisLabelColor,
                },
                //buttonPosition: {align: 'right'},
                verticalAlign: 'top',
                //dropdown: 'always',
                //floating: true,
                selected: 3,
                x: -5.5,
            },
            legend: {
                enabled: true,
                align: 'right',
                verticalAlign: 'top',
                y: -23,
                padding: 0,
                itemStyle: {
                    color: '#000000',
                    fontSize: "13px",
                },
            },
            tooltip: {
                animation: false,
                shared: true,
                split: false,
                headerFormat: '<span style="font-size: 11px; font-weight: bold">{point.key}</span><br/>',
                xDateFormat: '%b %e, %Y',
                backgroundColor: 'rgba(255, 255, 255, 1)',
                hideDelay: 0, // makes tooltip feel more responsive when crossing gap between plots
                style: {
                    color: '#000000',
                    fontSize: '11px',
                    fontFamily: chartFont,
                }
            },
            series: [
                {
                    name: 'Average price',
                    id: 'dailyPrice',
                    data: daily_prices,
                    lineWidth: 1.5,
                    states: {
                        hover: {
                            lineWidthPlus: 0,
                            halo: false, // disable translucent halo on marker hover
                        }
                    },
                    yAxis: 0,
                    color: primaryLineColor,
                    marker: {
                        states: {
                            hover: {
                                lineWidth: 0,
                            }
                        },
                    },
                    point: {
                        events: {
                            click: function() {
                                addToWatchlistModal(parseInt(this.y));
                            },
                        },
                    },
                    tooltip: {
                        pointFormatter: function() {
                            return `<span style="color:${this.color}">\u25CF</span>`
                                + ` ${this.series.name}:`
                                + ` <b>${this.y.toLocaleString()}g</b><br/>`;
                        },
                    },
                    zIndex: 1,
                }, {
                    name: 'Volume',
                    type: 'column',
                    data: daily_trade_volume,
                    showInLegend: false,
                    pointPadding: 0, // disable point and group padding to simulate column area chart
                    groupPadding: 0,
                    yAxis: 2,
                    color: volumeColor,
                    tooltip: {
                        pointFormatter: function() {
                            let volumeAmtText = this.y !== 0 ? this.y.toLocaleString() : 'n/a';
                            return `<span style="color:${this.color}">\u25CF</span>`
                                    + ` ${this.series.name}:`
                                    + ` <b>${volumeAmtText}</b><br/>`;
                        },
                    },
                    zIndex: 0,
                }, {
                    name: 'SB Index',
                    id: 'sbi',
                    data: sbi,
                    visible: false,
                    lineWidth: 1.5,
                    states: {
                        hover: {
                            lineWidthPlus: 0,
                            halo: false, // disable translucent halo on marker hover
                        }
                    },
                    yAxis: 1,
                    color: sbiLineColor,
                    marker: {
                        states: {
                            hover: {
                                lineWidth: 0,
                            }
                        },
                    },
                    tooltip: {
                        pointFormatter: function() {
                            if (this.y >= 1000) {
                                var sbiText = Math.round(this.y).toLocaleString();
                            } else if (this.y >= 100) {
                                var sbiText = this.y.toFixed(1).toLocaleString();
                            } else if (this.y >= 10) {
                                var sbiText = this.y.toFixed(2).toLocaleString();
                            } else {
                                var sbiText = this.y.toFixed(3).toLocaleString();
                            }
                            return `<span style="color:${this.color}">\u25CF</span>`
                                + ` SB Index:`
                                + ` <b>${sbiText} SB</b><br/>`;
                        },
                    },
                    zIndex: 2,
                },
            ],
            yAxis: [
                {
                    min: SettingsController.getStartChartAtZero() ? 0 : null,
                    labels: {
                        formatter: function() {
                            return this.value.toLocaleString() + 'g';
                        },
                        x: -8,
                    },
                    showLastLabel: true, // show label at top of chart
                    crosshair: {
                        dashStyle: 'ShortDot',
                        color: crosshairColor,
                    },
                    opposite: false,
                    alignTicks: false, // disabled, otherwise autoranger will create too large a Y-window
                }, {
                    min: SettingsController.getStartChartAtZero() ? 0 : null,
                    gridLineWidth: 0,
                    labels: {
                        formatter: function() {
                            return this.value.toLocaleString() + ' SB';
                        },
                        x: 5,
                    },
                    showLastLabel: true, // show label at top of chart
                    opposite: true,
                    alignTicks: false,
                }, {
                    top: '70%',
                    height: '30%',
                    offset: 0,
                    opposite: false,
                    tickPixelInterval: 35,
                    allowDecimals: false,
                    alignTicks: false,
                    visible: false,

            }],
            xAxis: {
                type: 'datetime',
                ordinal: false, // show continuous x axis if dates are missing
                plotBands: eventData,
                crosshair: {
                    dashStyle: 'ShortDot',
                    color: crosshairColor,
                },
                dateTimeLabelFormats:{
                    day: '%b %e',
                    week: '%b %e, \'%y',
                    month: '%b %Y',
                    year: '%Y'
                },
                tickPixelInterval: 120,
            },
            navigator: {
                height: 25,
                margin: 0,
                maskInside: false,
                enabled: false,
            }
        });
    }

    $.getJSON(`https://markethunt.vsong.ca/api/stock_data/getjson.php?item_id=${itemId}&plugin_ver=${GM_info.script.version}`, function (response) {
        renderChart(response);
    });
}

if (localStorage.markethuntEventDatesLastRetrieval === undefined) {
    updateEventData();
}

/*******************************
 * 
 *  Marketplace view observer  
 * 
 *******************************/

// sb.png minified with TinyPNG then converted to base 64
const sbImageData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABEAAAARCAMAAAAMs7fIAAABcVBMVEX+/v/5///+/fzwyJTuxJD1////6cn416z31ab206SOi4ny///t///b" +
      "///J///2/P/9/Pj4+Pjq6/b8+PPw8PPh4+7+9+3K5s//7M7/6Mb+5cP63bfv17b53LP21an1zJzWuprzzJDRrovpuoHmuXzktXu6k3Rd0HOzi2vp///Q//+z//+t///n/v/0+P/q7v/t7v79" +
      "+PjW//P/+/P2+vHZ7PHn6e3/+eft5+f/9ubi8eT/9OPw59//8t377dzh3tz+7dXN7dTa09Sv1tP35tHO1czX4cu+3cLazcLCysL44L3Uw7vDuLj32rar3LGvtbHq167gyK6S16nlyanl06je" +
      "w6jy06fxz6Z8oqSooKDszJ7Ls56MypvoxZqel5fQsZblwJWVkJB0xY3nvI10y4vswIv30IrvwInRp4jxyYeIg4XdtYPQq4LNpH65mnt9e3u+sXr0xHjZq3dZwHTPonR1dXHgqnC6kGtpbGnh" +
      "qWEs0UvWjFe8AAAA4klEQVQY02PACvgYITSvlbo4mCEY4V9awZUf4+ieUqUOFmFK5OKKjMtKCioW9zPRBAowAhFIJUSnFhBrczMwAJGIkKiomQhIkFWHj0GXQc+An4df3yfPlRUoxMNgaGFv" +
      "6uTpHF1SpqIA0StWWaCqzBwlL8+RngFxhnlhSJiblxSbhCRzEViE1ShNWlaGnZMzIFU1HqLLWFGOnZOZmYWFRcUD6g1FFg52DrnY3HINIahIpnJ2jpqGmlJCsjdUJFBJIViGTZJNOjwUKiLr" +
      "KyXhYGtpbediAxURExYWYGIAQgGgDwEEwCDFO/6WiQAAAABJRU5ErkJggg==";

const mpObserverTarget = document.querySelector("#overlayPopup");
const mpObserver = new MutationObserver(function () {
    // Check if the Marketplace interface is open
    if (!mpObserverTarget.querySelector(".marketplaceView")) {
        return;
    }

    // detect item page and inject chart
    const backButton = mpObserverTarget.querySelector("a.marketplaceView-breadcrumb");
    if (backButton) {
        const targetContainer = mpObserverTarget.querySelector(".marketplaceView-item-description");

        if (targetContainer && !mpObserverTarget.querySelector("#chartArea")) {
            // Disconnect and reconnect later to prevent mutation loop
            mpObserver.disconnect();

            // Setup chart divs
            const itemId = mpObserverTarget.querySelector(".marketplaceView-item.view").getAttribute("data-item-id");
            targetContainer.insertAdjacentHTML(
                "beforebegin",
                `<div id="chartArea" style="display: flex; padding: 0 20px 0 20px; height: 315px;">
                    <div id="highchartContainer" style="flex-grow: 1"></div>
                    <div id="markethuntInfobox" style="text-align: center; display: flex; flex-direction: column; padding: 34px 0 12px 5px">
                        <div class="marketplaceView-item-averagePrice infobox-stat infobox-small-spans infobox-striped">
                            Trade volume:<br>
                            <span id="infoboxTradevol">--</span><br>
                            <span id="infoboxGoldvol" class="marketplaceView-goldValue">--</span>
                        </div>
                        <div class="marketplaceView-item-averagePrice infobox-stat infobox-small-spans">
                            7-day trade volume:<br>
                            <span id="infobox7dTradevol">--</span><br>
                            <span id="infobox7dGoldvol" class="marketplaceView-goldValue">--</span>
                        </div>
                        <div style="flex-grow: 1"></div> <!-- spacer div -->
                        <div>
                            <a class="markethunt-cross-link" href="https://markethunt.vsong.ca/watchlist.php?action=add_watch_item&item_id=${itemId}" target="_blank">[Add to Watchlist]</a><br>
                            <a class="markethunt-cross-link" href="https://markethunt.vsong.ca/portfolio.php?action=add_position&item_id=${itemId}" target="_blank">[Add to Portfolio]</a><br>
                            <a class="markethunt-cross-link" href="https://markethunt.vsong.ca/index.php?item_id=${itemId}" target="_blank">[View on Markethunt]</a><br>
                            <a class="markethunt-settings-link" id="markethuntSettingsLink" href="#" >[Plugin Settings]</a>
                        </div>
                    </div>
                </div>`
            );

            const itemPriceContainer = mpObserverTarget.querySelector(".marketplaceView-item-averagePrice");
            itemPriceContainer.classList.add("infobox-stat");
            itemPriceContainer.insertAdjacentHTML(
                "beforeend",
                `<br><span id="infoboxSbPrice" class="marketplaceView-sbValue">--</span><img style="vertical-align: bottom" src="${sbImageData}" />`
            );

            const itemPriceDisplay = itemPriceContainer.querySelector("span");
            itemPriceDisplay.id = "infoboxPrice";

            const infoBox = document.getElementById("markethuntInfobox");
            infoBox.prepend(itemPriceContainer);

            // Set infobox minimum width to prevent layout shifts, *then* reset price display
            const infoBoxInitialWidth = $(infoBox).width();
            infoBox.style.minWidth = `${infoBoxInitialWidth}px`;

            itemPriceDisplay.innerHTML = "--";

            // Set Plugin Settings listener
            const settingsLink = document.getElementById("markethuntSettingsLink");
            settingsLink.addEventListener('click', openPluginSettings);

            // Render chart
            renderChartWithItemId(itemId, "highchartContainer");

            // Re-observe after mutation-inducing logic
            mpObserver.observe(mpObserverTarget, {
                childList: true,
                subtree: true
            });
        }
    }

    // detect history page and inject portfolio buttons
    const historyTab = mpObserverTarget.querySelector("[data-tab=history].active");
    if (SettingsController.getEnablePortfolioButtons() && historyTab) {
        mpObserver.disconnect();

        let rowElem = mpObserverTarget.querySelectorAll(".marketplaceMyListings tr.buy");
        rowElem.forEach(function(row) {
            if (!row.querySelector(".mousehuntActionButton.tiny.addPortfolio")) {
                let itemElem = row.querySelector(".marketplaceView-itemImage");
                const itemId = itemElem.getAttribute("data-item-id");

                let qtyElem = row.querySelector("td.marketplaceView-table-numeric");
                const qty = Number(qtyElem.innerText.replace(/\D/g, ''));

                let priceElem = row.querySelector("td.marketplaceView-table-numeric .marketplaceView-goldValue");
                const price = Number(priceElem.innerText.replace(/\D/g, ''));

                let buttonContainer = row.querySelector("td.marketplaceView-table-actions");
                let addPortfolioBtn = document.createElement("a");
                addPortfolioBtn.href = `https://markethunt.vsong.ca/portfolio.php?action=add_position&item_id=${itemId}&add_qty=${qty}&add_mark=${price}`;
                addPortfolioBtn.innerHTML = "<span>+ Portfolio</span>";
                addPortfolioBtn.className = "mousehuntActionButton tiny addPortfolio lightBlue";
                addPortfolioBtn.target = "_blank";
                addPortfolioBtn.style.display = "block";
                addPortfolioBtn.style.marginTop = "2px";
                buttonContainer.appendChild(addPortfolioBtn);
            }
        });

        mpObserver.observe(mpObserverTarget, {
            childList: true,
            subtree: true
        });
    }
});

// Initial observe
mpObserver.observe(mpObserverTarget, {
    childList: true,
    subtree: true
});

const mp_css_overrides = `
.marketplaceView-item {
    padding-top: 10px;
}
.marketplaceView-item-content {
    padding-top: 10px;
    padding-bottom: 0px;
    min-height: 0px;
}
.marketplaceView-item-descriptionContainer {
    padding-bottom: 5px;
    padding-top: 5px;
}
.marketplaceView-item-averagePrice {
    margin-top: 5px;
}
.marketplaceView-item-footer {
    padding-top: 10px;
    padding-bottom: 10px;
}
.markethunt-cross-link {
    color: #0000dd;
    font-size: 10px;
}
.markethunt-settings-link {
    color: #6a6a6a;
    font-size: 10px;
    margin-top: 3px;
}
.marketplaceView-item-averagePrice.infobox-stat {
    text-align: left;
    margin-bottom: 14px;
    white-space: nowrap;
}
.marketplaceView-item-leftBlock .marketplaceHome-block-viewAll {
    margin-top: 5px;
}
.infobox-striped {
}
.infobox-small-spans span {
    font-size: 11px;
}
.infobox-small-spans .marketplaceView-goldValue::after {
    width: 17px;
    height: 13px;
}
`;

/*******************************
 * 
 *  Journal observer  
 * 
 *******************************/

// add_portfolio_journal.png minified with TinyPNG then converted to base 64
const addPfolioBtnImgData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAALBAMAAACEzBAKAAAAFVBMVEUAAAAAAAD/swD06DD6zhj///8PDgMsru0CAAAAAXRSTlMA" +
      "QObYZgAAADhJREFUCNdjCBQEAwEGYWMwMERmmBkbCoIZhkAobMgg4igo6Cjo4sggpKQIhEqKyAwgQGEwQk0GAIl6DBhSGEjXAAAAAElFTkSuQmCC";

function addJournalButtons(supplyTransferJournalEntries) {
    supplyTransferJournalEntries.forEach(function(supplyTransferEntry) {
        const journalActionsElem = supplyTransferEntry.querySelector(".journalactions");
        const textElem = supplyTransferEntry.querySelector(".journaltext");

        if (journalActionsElem.querySelector("a.actionportfolio")) {
            return;
        }
        if (textElem.textContent.includes("SUPER|brie+") || textElem.textContent.includes("Passing Parcel")) {
            return;
        }
        // Disable button on sending transfers until portfolio sending feature implemented
        if (textElem.textContent.includes("I sent")) {
            return;
        }

        const addPortfolioBtn = document.createElement("a");
        addPortfolioBtn.href = "#";
        addPortfolioBtn.className = "actionportfolio";
        addPortfolioBtn.addEventListener('click', addSbTradeToPortfolio);
        journalActionsElem.prepend(addPortfolioBtn)
    });
}

async function updateItemMetadata() {
    console.log("Retrieveing marketplace item data");
    return new Promise((resolve, reject) => {
        hg.utils.Marketplace.getMarketplaceData(
            function (response) {
                const itemMetadata = response.marketplace_items.reduce(
                    function (items, item) {
                        items[normalizeItemName(item.name)] = item.item_id;
                        return items;
                    },
                    {}
                );
                localStorage.markethuntItemMetadata = JSON.stringify(itemMetadata);
                localStorage.markethuntItemMetadataLastRetrieval = Date.now();
                resolve(itemMetadata);
            },
            function (e) {
                reject(e);
            }
        );
    });
}

function normalizeItemName(name) {
    return name.trim();
}

async function addSbTradeToPortfolio(event) {
    event.preventDefault(); // prevent scroll to top

    const targetTransferJournalEntry = event.target.parentNode.parentNode.parentNode;
    const textElem = targetTransferJournalEntry.querySelector(".journaltext");
    const targetEntryId = Number(targetTransferJournalEntry.dataset.entryId);
    // group 1 = qty, group 2 = item name, group 3 = trade partner snuid
    const regex = /^I received (\d[\d,]*) (.+?) from <a href.+snuid=(\d+)/

    // get item and partner data
    const targetEntryMatch = textElem.innerHTML.match(regex);
    const targetItemQty = Number(targetEntryMatch[1].replace(",", ""));
    const targetItemName = targetEntryMatch[2];
    const partnerSnuid = targetEntryMatch[3];
    const partnerName = textElem.querySelector('a').innerHTML;

    // get item ID
    let targetItemId = undefined;
    if (localStorage.markethuntItemMetadata !== undefined) {
        const itemMetadata = JSON.parse(localStorage.markethuntItemMetadata);
        targetItemId = itemMetadata[normalizeItemName(targetItemName)];
    }

    if (targetItemId === undefined) {
        $.toast({
            text: "Please wait ...",
            heading: localStorage.markethuntItemMetadata === undefined ? 'Downloading item data' : 'Reloading item data',
            icon: 'info',
            position: 'top-left',
            loader: false,  // Whether to show loader or not. True by default
        });
        const itemMetadata = await updateItemMetadata();
        await sleep(600); // allow user to read toast before opening new tab
        targetItemId = itemMetadata[normalizeItemName(targetItemName)];
    }

    // detect all sb send entries
    const allSupplyTransferJournalEntries = document.querySelectorAll("#journalContainer div.entry.supplytransferitem");
    const matchingSbSendEntries = Array.from(allSupplyTransferJournalEntries).reduce(
        function(results, journalEntry) {
            const innerHTML = journalEntry.querySelector(".journaltext").innerHTML;
            if (!innerHTML.includes(partnerSnuid)) {
                return results;
            }
            const candidateSbMatch = innerHTML.match(/^I sent (\d[\d,]*) SUPER\|brie\+ to <a href/);
            if (!candidateSbMatch) {
                return results;
            }
            const candidateSbSent = Number(candidateSbMatch[1].replace(",", ""));
            const candidateEntryId = Number(journalEntry.dataset.entryId);
            results.push({sbSent: candidateSbSent, entryId: candidateEntryId});
            return results;
        },
        []
    );

    // choose best sb send entry
    let bestSbSendEntryMatch = null;
    let bestMatchDistance = null;
    matchingSbSendEntries.forEach(function(candidateEntry) {
        const entryPairDistance = Math.abs(targetEntryId - candidateEntry.entryId);
        if (bestMatchDistance === null || bestMatchDistance > entryPairDistance) {
            bestSbSendEntryMatch = candidateEntry;
            bestMatchDistance = entryPairDistance;
        }
    });

    let avgSbPriceString = "none";
    if (bestSbSendEntryMatch !== null) {
        const avgSbPrice = bestSbSendEntryMatch.sbSent / targetItemQty;
        avgSbPriceString = avgSbPrice.toFixed(2);
    }

    // prepare modal message
    let actionMsg = 'Markethunt plugin: ';
    if (bestSbSendEntryMatch !== null) {
        actionMsg += `Found a transfer of ${bestSbSendEntryMatch.sbSent.toLocaleString()} SB to ${partnerName}.` + 
            ` Buy price has been filled in for you.`;
    } else {
        actionMsg += 'No matching SB transfer found. Please fill in buy price manually.';
    }

    // open in new tab
    window.open(`https://markethunt.vsong.ca/portfolio.php?action=add_position` + 
        `&action_msg=${encodeURIComponent(actionMsg)}` +
        `&item_id=${targetItemId}` + 
        `&add_qty=${targetItemQty}` + 
        `&add_mark=${avgSbPriceString}` +
        `&add_mark_type=sb`,
        '_blank');
}

const journalObserverTarget = document.querySelector("#mousehuntContainer");
const journalObserver = new MutationObserver(function () {
    // Disconnect and reconnect later to prevent mutation loop
    journalObserver.disconnect();

    const journalContainer = journalObserverTarget.querySelector("#journalContainer");
    if (SettingsController.getEnablePortfolioButtons() && journalContainer) {
        // add portfolio buttons
        const supplyTransferJournalEntries = journalContainer.querySelectorAll("div.entry.supplytransferitem");
        addJournalButtons(supplyTransferJournalEntries);
    }

    // Reconnect observer once all mutations done
    journalObserver.observe(journalObserverTarget, {
        childList: true,
        subtree: true
    });
});

// Initial observe
journalObserver.observe(journalObserverTarget, {
    childList: true,
    subtree: true
});

const journal_css_overrides = `
.journalactions a {
    display: inline-block;
}
.journalactions a.actionportfolio {
    margin-right: 5px;
    background: url('${addPfolioBtnImgData}');
    width: 16px;
}
`;

/*******************************
 * 
 *  Import Portfolio  
 * 
 *******************************/

function addTouchPoint() {
    if ($('.invImport').length == 0) {
        const invPages = $('.inventory .torn_pages');
        //Inventory History Button
        const invImportElem = document.createElement('li');
        invImportElem.classList.add('crafting');
        invImportElem.classList.add('invImport');
        const invImportBtn = document.createElement('a');
        invImportBtn.href = "#";
        invImportBtn.innerText = "Export to Markethunt";
        invImportBtn.onclick = function () {
            onInvImportClick();
        };
        const icon = document.createElement("div");
        icon.className = "icon";
        invImportBtn.appendChild(icon);
        invImportElem.appendChild(invImportBtn);
        $(invImportElem).insertAfter(invPages);
    }
}

function submitInv() {
    if (!document.forms["import-form"].reportValidity()) {
        return;
    }

    const itemsToGet = ['weapon','base', 'trinket', 'bait', 'skin', 'crafting_item','convertible', 'potion', 'stat','collectible','map_piece','adventure']; //future proof this to allow for exclusions
    let itemsArray = [];
    hg.utils.UserInventory.getItemsByClass(itemsToGet,true,function(data) {
        data.forEach(function(arrayItem, index) {
            itemsArray[index] = [arrayItem.item_id, arrayItem.quantity];
        });

        $('#import-data').val(JSON.stringify(itemsArray));
        document.forms["import-form"].submit();
    })
}

function onInvImportClick(){
    $.dialog({
        title: 'Export inventory to Markethunt',
        content: `
        <form id="import-form" name="import-form" action="https://markethunt.vsong.ca/import_portfolio.php" method="post" target="_blank">
                <label for="import-portfolio-name">Portfolio name: <span style="color: red">*</span></label>
                <input type="text" id="import-portfolio-name" name="import-portfolio-name" required pattern=".+"/>
                <input type="hidden" id="import-data" name="import-data"/>
        </form>
        <div id="export-dialog-buttons" class="jconfirm-buttons" style="float: none; margin-top: 10px;"><button type="button" class="btn btn-primary">Export</button></div>`,
        boxWidth: '600px',
        useBootstrap: false,
        closeIcon: true,
        draggable: true,
        onOpen: function(){
            $('#import-portfolio-name').val('Portfolio ' + (new Date()).toISOString().substring(0, 10));
            this.$content.find('button').click(function(){
                submitInv();
            });
        }
    });
}

/*******************************
 * 
 *  Final setup and add css  
 * 
 *******************************/

$(document).ready(function() {
    GM_addStyle(GM_getResourceText("jq_confirm_css"));
    GM_addStyle(GM_getResourceText("jq_toast_css"));
    GM_addStyle(mp_css_overrides);
    GM_addStyle(journal_css_overrides);

    addTouchPoint();

    const supplyTransferJournalEntries = document.querySelectorAll("#journalContainer div.entry.supplytransferitem");
    addJournalButtons(supplyTransferJournalEntries);
});