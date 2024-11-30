// Set dimensions and margins for the SVG
const width = 1400;
const height = 600;

let currentSelectedState = null; // Holds the name of the currently selected state


// Append an SVG to the map div and create a group to hold the map elements
const svg = d3.select("#map")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

// Add ocean background
svg.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "#cce7ff");

// Optional: Add gradient ocean
svg.append("defs")
    .append("linearGradient")
    .attr("id", "ocean-gradient")
    .attr("x1", "0%").attr("y1", "0%")
    .attr("x2", "0%").attr("y2", "100%")
    .selectAll("stop")
    .data([
        { offset: "0%", color: "#cce7ff" },
        { offset: "100%", color: "#a2d3f7" }
    ])
    .enter()
    .append("stop")
    .attr("offset", d => d.offset)
    .attr("stop-color", d => d.color);

svg.select("rect").attr("fill", "url(#ocean-gradient)");

const mapGroup = svg.append("g"); // Group for zoom/pan
const hospitalGroup = svg.append("g"); // Group for hospitals

// Define a color scale for infection counts
const colorScale = d3.scaleSequential(d3.interpolateBlues)
    .domain([500, 90000]); // Adjust max domain value based on infection data

// Define a tooltip
const tooltip = d3.select("body").append("div")
    .attr("id", "tooltip")
    .style("position", "absolute")
    .style("background-color", "white")
    .style("padding", "5px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "4px")
    .style("display", "none");

// Infection name normalization function
const infectionMapping = {
    "MRSA Observed Cases": "MRSA bacteremia",
    "MRSA Bacteremia: Observed Cases": "MRSA bacteremia",
    "C.diff Observed Cases": "Clostridium Difficile",
    "Clostridium Difficile (C.Diff): Observed Cases": "Clostridium Difficile",
    "CLABSI: Observed Cases": "CLABSI",
    "Central Line Associated Bloodstream Infection (ICU + select Wards): Observed Cases": "CLABSI",
    "CAUTI: Observed Cases": "CAUTI",
    "Catheter Associated Urinary Tract Infections (ICU + select Wards): Observed Cases": "CAUTI",
    "SSI: Colon Observed Cases": "SSI: Colon",
    "SSI - Colon Surgery: Observed Cases": "SSI: Colon",
    "SSI: Abdominal Observed Cases": "SSI: Abdominal",
    "SSI - Abdominal Hysterectomy: Observed Cases": "SSI: Abdominal",
};

function normalizeInfectionName(infectionName) {
    return infectionMapping[infectionName] || infectionName;
}


// Load the GeoJSON data and infection data
Promise.all([
    d3.json("/GZ2.geojson"), 
    fetch("/api/infections").then(response => response.json()) // Fetch infection data from API
]).then(([geoData, infectionData]) => {
    // Process infection data by state
    const infectionByState = {};
    infectionData.forEach(d => {
        const state = d.state;
        const score = +d.score;
        infectionByState[state] = (infectionByState[state] || 0) + score;
    });

    // Populate filter dropdown with unique infection types
    const infectionTypes = Array.from(new Set(infectionData.map(d => normalizeInfectionName(d.measure_name))));
    const filterDropdown = d3.select('#filter');
    infectionTypes.forEach(type => {
        filterDropdown.append("option").attr("value", type).text(type);
    });

    // Define projection and path generator
    const projection = d3.geoAlbersUsa()
        .translate([width / 2, height / 2])
        .scale(1100);
    const path = d3.geoPath().projection(projection);

    // Bind data and create one path per GeoJSON feature
    const states = mapGroup.selectAll("path")
        .data(geoData.features)
        .enter()
        .append("path")
        .attr("d", path)
        .attr("fill", d => {
            const state = d.properties.NAME;
            const infectionCount = infectionByState[state];
            return infectionCount ? colorScale(infectionCount) : "#eee"; // Fill color based on infection count
        })
        .attr("stroke", "#333")
        .attr("stroke-width", 0.5)
        .on("mouseover", function(event, d) {
            const state = d.properties.NAME;
            const infectionCount = infectionByState[state] || "No data";
            tooltip.style("display", "block")
                .html(`<strong>${state}</strong><br>Infections: ${infectionCount}`);
            d3.select(this).attr("stroke", "black").attr("stroke-width", 1);
        })
        .on("mousemove", function(event) {
            tooltip.style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 20) + "px");
        })
        .on("mouseout", function() {
            tooltip.style("display", "none");
            d3.select(this).attr("stroke", "#333").attr("stroke-width", 0.5);
        })
        .on("click", zoomToState); 

    // Zoom function update: sync zoom with hospitals and map
    const zoom = d3.zoom()
        .scaleExtent([1, 8]) // Define zoom limits
        .on("zoom", (event) => {
            mapGroup.attr("transform", event.transform);
            hospitalGroup.selectAll("circle")
                .attr("transform", event.transform)
                .attr("r", 5 / event.transform.k); // Adjust radius based on zoom scale (1/k)
        });

    svg.call(zoom); // Apply zoom behavior to the SVG

    // Zoom-to-State function (focus on clicked state and gray out others)
    function zoomToState(event, d) {
        const stateName = d.properties.NAME;
        currentSelectedState = stateName; // Update the global variable
        console.log("Selected State:", currentSelectedState);

        // Gray out other states
        states.attr("fill", feature => {
            const featureState = feature.properties.NAME;
            if (featureState === stateName) {
                const infectionCount = infectionByState[featureState];
                return infectionCount ? colorScale(infectionCount) : "#eee";
            } else {
                return "#ccc"; 
            }
        });

        // Get bounds of the selected state and zoom in
        const [[x0, y0], [x1, y1]] = path.bounds(d);
        const dx = x1 - x0;
        const dy = y1 - y0;
        const x = (x0 + x1) / 2;
        const y = (y0 + y1) / 2;
        const scale = Math.max(1, Math.min(8, 0.9 / Math.max(dx / width, dy / height)));
        const translate = [width / 2 - scale * x, height / 2 - scale * y];

        svg.transition()
            .duration(750)
            .call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));

        showHospitals(stateName);
    }

    function showHospitals(stateName) {
        const selectedType = d3.select("#filter").node().value;
        console.log("Showing hospitals for:", stateName, "with infection type:", selectedType);

        fetch(`/api/infections?state=${stateName}`)
            .then(response => response.json())
            .then(stateData => {
                const aggregatedData = aggregateInfectionData(stateData, selectedType);
                updateHospitals(aggregatedData, selectedType);
            })
            .catch(error => console.error("Error fetching state data:", error));
    }

    // Update the filter change event listener
    filterDropdown.on("change", function() {
        const selectedType = this.value;
        console.log("Filter changed to:", selectedType);

        fetch(`/api/infections?infectionType=${selectedType}`)
            .then(response => response.json())
            .then(filteredData => {
                const infectionByState = {};
                filteredData.forEach(d => {
                    const state = d.state;
                    const score = +d.score;
                    infectionByState[state] = (infectionByState[state] || 0) + score;
                });

                // Update state fills
                states.attr("fill", d => {
                    const state = d.properties.NAME;
                    const infectionCount = infectionByState[state];
                    return infectionCount ? colorScale(infectionCount) : "#eee";
                });

                // Check if a state is currently selected
                if (currentSelectedState) {
                    // Update hospitals for the selected state
                    const stateData = filteredData.filter(d => d.state === currentSelectedState);
                    updateHospitals(stateData, selectedType);

                    // Directly apply zoom transformation
                    const selectedStateFeature = geoData.features.find(
                        feature => feature.properties.NAME === currentSelectedState
                    );
                    if (selectedStateFeature) {
                        const [[x0, y0], [x1, y1]] = path.bounds(selectedStateFeature);
                        const dx = x1 - x0;
                        const dy = y1 - y0;
                        const x = (x0 + x1) / 2;
                        const y = (y0 + y1) / 2;
                        const scale = Math.max(1, Math.min(8, 0.9 / Math.max(dx / width, dy / height)));
                        const translate = [width / 2 - scale * x, height / 2 - scale * y];

                        svg.transition()
                            .duration(750)
                            .call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
                    }
                }
            })
            .catch(error => console.error("Error fetching filtered data:", error));
    });

    // Function to update hospitals based on filtered data
    function updateHospitals(aggregatedData, selectedType) {
        console.log("Updating hospitals with data:", aggregatedData);

        // Remove any existing hospital markers
        hospitalGroup.selectAll("circle").remove();

        // Add new hospital circles
        hospitalGroup.selectAll("circle")
            .data(aggregatedData, d => d.hospital_id)
            .enter()
            .append("circle")
            .attr("cx", d => {
                const coords = projection([+d.lon, +d.lat]);
                return coords ? coords[0] : null;
            })
            .attr("cy", d => {
                const coords = projection([+d.lon, +d.lat]);
                return coords ? coords[1] : null;
            })
            .attr("r", 5)
            .attr("fill", "red")
            .attr("opacity", 0.7)
            .on("mouseover", (event, d) => {
                tooltip.style("display", "block")
                    .html(`<strong>${d.hospital_id}</strong><br>
                           ${selectedType === "all" ? `All Infections: ${d.totalScore}` :
                             `Infection Type: ${selectedType}<br>Count: ${d.totalScore || "No data"}`}`);
            })
            .on("mousemove", (event) => {
                tooltip.style("left", `${event.pageX + 10}px`)
                       .style("top", `${event.pageY - 20}px`);
            })
            .on("mouseout", () => {
                tooltip.style("display", "none");
            });
    }

    // Aggregation logic for infection counts by hospital and infection type
        function aggregateInfectionData(infectionData, selectedType) {
            // Normalize infection names
            const normalizedData = infectionData.map(d => ({
                ...d,
                measure_name: normalizeInfectionName(d.measure_name),
                score: +d.score || 0 // Ensure the score is a number
            }));

            // Filter data by infection type
            const filteredData = selectedType === "all"
                ? normalizedData // Include all infections
                : normalizedData.filter(d => d.measure_name === selectedType);

            // Group by hospital_id and measure_name, summing scores
            const aggregatedData = Array.from(
                d3.rollup(
                    filteredData,
                    group => d3.sum(group, d => d.score), // Sum the scores
                    d => d.hospital_id,
                    d => d.measure_name
                ),
                ([hospital_id, infectionMap]) => ({
                    hospital_id,
                    totalScore: selectedType === "all" 
                        ? Array.from(infectionMap.values()).reduce((sum, score) => sum + score, 0)
                        : infectionMap.get(selectedType) || 0,
                    lon: filteredData.find(d => d.hospital_id === hospital_id)?.lon,
                    lat: filteredData.find(d => d.hospital_id === hospital_id)?.lat
                })
            );

            return aggregatedData;
        }

    
        // Calculate "all" infection count by aggregating across all infection types
        function calculateAllInfections(stateName) {
            const aggregatedInfections = {};

            infectionData.forEach(d => {
                const normalizedType = normalizeInfectionName(d.measure_name);
                const state = d.state;
                if (state === stateName) {
                    aggregatedInfections[normalizedType] = (aggregatedInfections[normalizedType] || 0) + +d.score;
                }
            });

            // Return total sum of all infections for the state
            return Object.values(aggregatedInfections).reduce((sum, count) => sum + count, 0);
        }

    // Populate dropdowns after loading data
    function populateDropdowns(infectionData) {
        const states = Array.from(new Set(infectionData.map(d => d.state))).sort();
        const hospitals = Array.from(new Set(infectionData.map(d => d.hospital_id))).sort();
        const infections = Array.from(new Set(infectionData.map(d => normalizeInfectionName(d.measure_name))));

        // Populate the state dropdown and attach a callback to update hospitals
        populateDropdown("stateSelect", "stateInput", states, (selectedState) => {
            const filteredHospitals = selectedState === "all"
                ? hospitals
                : Array.from(new Set(infectionData
                      .filter(d => d.state === selectedState)
                      .map(d => d.hospital_id)
                  )).sort();

            updateHospitalDropdown(filteredHospitals);
        });

        // Populate the hospital and infection type dropdowns
        populateDropdown("hospitalSelect", "hospitalInput", hospitals);
        populateDropdown("infectionSelect", "infectionInput", infections);
    }


    // Populate a single dropdown with search functionality
    function populateDropdown(selectId, inputId, options, onOptionChange = () => {}) {
        const select = document.getElementById(selectId);
        const input = document.getElementById(inputId);

        // Add all options to the dropdown
        options.forEach(option => {
            const opt = document.createElement("option");
            opt.value = option;
            opt.text = option;
            select.appendChild(opt);
        });

        // Add event listener to filter options based on input
        input.addEventListener("input", () => {
            const filter = input.value.toLowerCase();
            select.innerHTML = ""; // Clear existing options

            // Add filtered options to the dropdown
            options
                .filter(option => option.toLowerCase().includes(filter))
                .forEach(option => {
                    const opt = document.createElement("option");
                    opt.value = option;
                    opt.text = option;
                    select.appendChild(opt);
                });

            // Auto-select the first matching option
            if (select.options.length > 0) {
                select.selectedIndex = 0;
            }

            // Trigger the callback with the new selection (if valid)
            const selectedValue = select.options[0]?.value || "";
            onOptionChange(selectedValue);
        });

        // Sync input value with selected dropdown option
        select.addEventListener("change", () => {
            input.value = select.value;
            onOptionChange(select.value);
        });
    }


    // Load dropdown options and add event listeners
    Promise.all([
        d3.json("/GZ2.geojson"),
        fetch("/api/infections").then(response => response.json()) // Fetch infection data from API
    ]).then(([geoData, infectionData]) => {
        populateDropdowns(infectionData);

        // Add event listener for state dropdown changes
        d3.select("#stateSelect").on("change", function () {
            const selectedState = this.value;

            // Filter hospitals based on selected state
            const filteredHospitals = selectedState === "all"
                ? Array.from(new Set(infectionData.map(d => d.hospital_id))).sort()
                : Array.from(new Set(infectionData.filter(d => d.state === selectedState).map(d => d.hospital_id))).sort();

            updateHospitalDropdown(filteredHospitals);
        });

    }).catch(error => {
        console.error("Error loading data:", error);
    });

    function updateHospitalDropdown(hospitals) {
        const hospitalSelect = document.getElementById("hospitalSelect");
        const hospitalInput = document.getElementById("hospitalInput");

        // Clear existing dropdown options
        hospitalSelect.innerHTML = "";
        hospitalInput.value = ""; // Clear the search input

        // Add "All Hospitals" as a default option
        const allOption = document.createElement("option");
        allOption.value = "all";
        allOption.text = "All Hospitals";
        hospitalSelect.appendChild(allOption);

        // Populate the dropdown with updated hospitals
        hospitals.forEach(hospital => {
            const option = document.createElement("option");
            option.value = hospital;
            option.text = hospital;
            hospitalSelect.appendChild(option);
        });

        // Sync search functionality with the updated dropdown
        hospitalInput.addEventListener("input", () => {
            const filter = hospitalInput.value.toLowerCase();
            hospitalSelect.innerHTML = ""; // Clear dropdown
            hospitals
                .filter(hospital => hospital.toLowerCase().includes(filter))
                .forEach(hospital => {
                    const option = document.createElement("option");
                    option.value = hospital;
                    option.text = hospital;
                    hospitalSelect.appendChild(option);
                });

            // Auto-select the first matching option
            if (hospitalSelect.options.length > 0) {
                hospitalSelect.selectedIndex = 0;
            }
        });

        hospitalSelect.addEventListener("change", () => {
            hospitalInput.value = hospitalSelect.value;
        });
    }



    // Manage visibility of dropdowns
    function setupDropdownVisibility() {
        const inputs = [
            { inputId: "stateInput", dropdownId: "stateSelect" },
            { inputId: "hospitalInput", dropdownId: "hospitalSelect" },
            { inputId: "infectionInput", dropdownId: "infectionSelect" }
        ];

        inputs.forEach(({ inputId, dropdownId }) => {
            const input = document.getElementById(inputId);
            const dropdown = document.getElementById(dropdownId);

            // Hide all dropdowns initially
            dropdown.style.display = "none";

            // Add focus listener to the input
            input.addEventListener("focus", () => {
                // Hide all other dropdowns
                inputs.forEach(({ dropdownId: otherDropdownId }) => {
                    if (dropdownId !== otherDropdownId) {
                        document.getElementById(otherDropdownId).style.display = "none";
                    }
                });

                // Show the current dropdown
                dropdown.style.display = "block";
            });

            // Add blur listener to hide the dropdown when clicking outside
            input.addEventListener("blur", () => {
                setTimeout(() => dropdown.style.display = "none", 200); // Delay to allow option selection
            });

            // Keep input in sync with the dropdown
            dropdown.addEventListener("change", () => {
                input.value = dropdown.value;
                dropdown.style.display = "none"; // Hide the dropdown after selection
            });
        });
    }

    // Call this function after populating dropdowns
    setupDropdownVisibility();

        

    // Event listeners for modal
    const exportButton = document.getElementById("exportButton");
    const exportModal = document.getElementById("exportModal");
    const closeModalButton = document.getElementById("closeModalButton");

    exportButton.addEventListener("click", () => {
        exportModal.style.display = "block";
    });

    closeModalButton.addEventListener("click", () => {
        exportModal.style.display = "none";
    });

    // Export CSV logic
    // Export CSV logic for all columns
    document.getElementById("exportCsvButton").addEventListener("click", () => {
        const selectedState = document.getElementById("stateSelect").value;
        const selectedHospital = document.getElementById("hospitalSelect").value;
        const selectedInfection = document.getElementById("infectionSelect").value;

        // Filter data based on dropdown selections
        const filteredData = infectionData.filter(d =>
            (selectedState === "all" || d.state === selectedState) &&
            (selectedHospital === "all" || d.hospital_id === selectedHospital) &&
            (selectedInfection === "all" || normalizeInfectionName(d.measure_name) === selectedInfection)
        );

        // Define all columns (A-P)
        const columns = [
            "l", "facility_id", "hospital_id", "address", "city", "state",
            "zip_code", "county_name", "measure_name", "compared_to_national",
            "score", "start_date", "end_date", "original_Address", "lat", "lon"
        ];

        // Create CSV content
        const csvContent = [
            columns.join(","), // Add header row
            ...filteredData.map(d => columns.map(col => d[col] || "").join(",")) // Map data rows
        ].join("\n");

        // Trigger file download
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "HA-Infections.csv";
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Close the modal after export
        document.getElementById("exportModal").style.display = "none";
    });



    // Populate dropdowns after loading data
    // Populate dropdowns after loading data
    Promise.all([
        d3.json("/GZ2.geojson"), 
        d3.csv("healthcare_data.csv")  
    ]).then(([geoData, infectionData]) => {
        // Populate state, hospital, and infection type dropdowns
        populateDropdowns(infectionData);

        // Add event listener for state dropdown changes
        d3.select("#stateSelect").on("change", function () {
            const selectedState = this.value;

            // Filter hospitals based on selected state
            const filteredHospitals = selectedState === "all"
                ? Array.from(new Set(infectionData.map(d => d.hospital_id))).sort()
                : Array.from(new Set(infectionData.filter(d => d.state === selectedState).map(d => d.hospital_id))).sort();

            updateHospitalDropdown(filteredHospitals);
        });

    }).catch(error => {
        console.error("Error loading data:", error);
    });



        
        
    
        d3.select("#resetButton").on("click", () => {
            currentSelectedState = null; // Reset the global variable
        
            // Reset zoom
            svg.transition()
                .duration(750)
                .call(zoom.transform, d3.zoomIdentity);
        
            // Reset colors for all states 
            states.transition().duration(750)
                .attr("fill", d => {
                    const state = d.properties.NAME;
                    const infectionCount = infectionByState[state];
                    return infectionCount ? colorScale(infectionCount) : "#eee";
                })
                .attr("opacity", 1);
        
            // Remove all hospital circles when reset is clicked
            hospitalGroup.selectAll("circle").remove();
        });
        

    
    // Add a legend for the color scale
    const legendWidth = 300;
    const legendHeight = 10;

    const legendGroup = svg.append("g")
    .attr("transform", `translate(${width - legendWidth - 50},${height - 60})`);

    legendGroup.append("rect")
        .attr("width", legendWidth + 20)
        .attr("height", legendHeight + 40)
        .attr("fill", "#fff")
        .attr("stroke", "#ccc")
        .attr("rx", 5)
        .attr("ry", 5);

    legendGroup.append("text")
        .attr("x", legendWidth / 2)
        .attr("y", 10)
        .attr("text-anchor", "middle")
        .attr("font-size", 14)
        .text("Infection Counts");


    const legendSvg = svg.append("g")
        .attr("transform", `translate(${width - legendWidth - 20},${height - 30})`);

    const legendScale = d3.scaleLinear()
        .domain(colorScale.domain())
        .range([0, legendWidth]);

    const legendAxis = d3.axisBottom(legendScale)
        .ticks(5)
        .tickSize(6);

    legendSvg.append("g")
        .attr("transform", `translate(0, ${legendHeight + 2})`)
        .call(legendAxis)
        .select(".domain").remove();

    const gradient = legendSvg.append("defs")
        .append("linearGradient")
        .attr("id", "gradient")
        .attr("x1", "0%").attr("y1", "0%")
        .attr("x2", "100%").attr("y2", "0%");

    gradient.append("stop").attr("offset", "0%").attr("stop-color", colorScale.range()[0]);
    gradient.append("stop").attr("offset", "100%").attr("stop-color", colorScale.range()[1]);

    legendSvg.append("rect")
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .style("fill", "url(#gradient)");

}).catch(error => {
    console.error("Error loading data:", error);
    

});

// Relative path to the hospital icon PNG
const hospitalIconUrl = "hospital-icon.png"; // Ensure this is the correct file name

// Assuming you have a D3 selection for your map
d3.select("#map")
  .selectAll("image")
  .data(hospitals) // Replace with your data array
  .enter()
  .append("image") // Use "image" instead of "svg:image"
  .attr("xlink:href", hospitalIconUrl) // Use the PNG image URL
  .attr("width", 20) // Adjust size as needed
  .attr("height", 20)
  .attr("x", d => projection([d.longitude, d.latitude])[0] - 10) // Adjust positioning
  .attr("y", d => projection([d.longitude, d.latitude])[1] - 10);