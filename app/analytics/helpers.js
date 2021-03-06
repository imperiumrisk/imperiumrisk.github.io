const factorsToProportions = (factors) => {
	output = [];
	// First we calculate inherent risk
	weight_data = getWeightingData(SELECTED_RISK, SELECTED_BU);
	ir_severity = 0;
	background_severity = 0;
	weight_data.severity.forEach( row => {
		if(row.label == "Background Risk") {
			ir_severity += row.weight;
			// We save background severity for later
			background_severity = row.weight;
		} else {
			factor = factors.find( elem => elem.label==row.label )
			if(factor && !factor.is_control) {
				ir_severity += row.weight * factor.val;
			}
		}
	});
	// Next residual risk
	// We actuall do the ratings based on their maximum
	rr_severity = ir_severity
	weight_data.severity.forEach( row => {
		// We don't worry about background risk as it won't be an input factor
		factor = getControlData(SELECTED_RISK,SELECTED_BU).find( elem => elem.label == row.label );
		if(factor) {
			rr_severity += row.weight * factor.max;
		}
	})
	// Now the IRF weightings
	weight_data.severity.forEach( row => {
		if(row.label == "Background Risk") {
			//output.push({label: "Background Risk", proportion:  (row.weight/ir_severity)*100.0, is_control: false});
			// We don't want a background risk label
			return
		} else {
			factor = factors.find( elem => elem.label==row.label );
			if(factor && !factor.is_control) {
				// What proportion does this element contribute to the non-background risk
				output.push({label: row.label, proportion: ((factor.val*row.weight)/(ir_severity-background_severity))*100.0, is_control: false});
			}
		}
	});
	// Now the control weightings
	weight_data.severity.forEach( row => {
		// We don't worry about background risk as it won't be an input factor
		factor = getControlData(SELECTED_RISK,SELECTED_BU).find( elem => elem.label==row.label );
		factorInList = factors.find(elem => elem.label==row.label );
		if(factor && factorInList) {
			bottomProp = ((factor.max*row.weight)/(rr_severity-ir_severity));
			if(bottomProp == 0) {
				topProp = 0
			} else {
				topProp = (factorInList.val / factor.max)*bottomProp;
			}
			output.push({label: row.label, top_proportion: topProp*100.0, bottom_proportion: bottomProp*100.0, is_control: true, type: factor.type});
		}
	});
	return output;
}

const getSeverity = (inputs) => {
	severity = 0;
	getWeightingData(SELECTED_RISK,SELECTED_BU).severity.forEach( row => {
		if(row.label == "Background Risk") {
			severity += row.weight
		} else {
			input = inputs.find( elem => elem.label==row.label )
			if(input) {
				severity += row.weight * input.val;
			}
		}
	})
	severity = Math.exp(severity);
	severity = severity<0 ? 0 : severity;
	return severity;
}

const poissonPMF = (lambda, k) => {
	kfac = 1;
	for(i=1; i<=k; i++) {
		kfac = kfac * i;
	}
	return (Math.pow(lambda, k) * Math.exp(-lambda))/(kfac);
}

const getLikelihood = (inputs) => {
	poisson = 0;
	getWeightingData(SELECTED_RISK,SELECTED_BU).poisson.forEach( row => {
		if(row.label == "Background Risk") {
			poisson += row.weight
		} else {
			input = inputs.find( elem => elem.label==row.label )
			if(input) {
				poisson += row.weight * input.val;
			}
		}
	});
	// If the poisson is negative then we just say every 100 years
	if(poisson<0) {
		return 400;
	}
	// We now need to turn Poisson into expected time between severe events
	epsilon = 0.0001;
	q = 0;
	i = 1;
	err = epsilon + 1;
	while(err > epsilon){
		qold = q;
		q += poissonPMF(poisson, i)*(1-Math.pow(0.95,i));
		err = Math.abs(q-qold);
		i=i+1;
	}
	// return q;
	expec = 0;
	i = 1;
	err = epsilon + 1;
	while(err > epsilon) {
		expecold=expec;
		expec += i * Math.pow(1-q, i-1) * q;
		err = Math.abs(expec-expecold);
		i=i+1;
	}
	return expec;
}

const severityLikelihoodToPlacement = (severity, likelihood) => {
	if(severity < 200000) {
		severityPlace = 0;
	} else if (severity < 1000000) {
		severityPlace = 1;
	} else if (severity < 5000000) {
		severityPlace = 2;
	} else if (severity < 50000000) {
		severityPlace = 3;
	} else {
		severityPlace = 4;
	}
	if (likelihood < 4) {
		likelihoodPlace = 0;
	} else if (likelihood < 12) {
		likelihoodPlace = 1;
	} else if (likelihood < 40) {
		likelihoodPlace = 2;
	} else if (likelihood < 80) {
		likelihoodPlace = 3;
	} else {
		likelihoodPlace = 4;
	}
	gridPlacement = 5*likelihoodPlace + severityPlace;
	return gridPlacement;
}

const resetIrfValues = () => {
	getIRFData(SELECTED_RISK, SELECTED_BU).forEach( factor => {
		slider = document.getElementById(factor.slider_id);
		output = document.getElementById(factor.output_id);
		// Update slider
		slider.value = factor.init;
		// Update data source 
		setIrfValue(SELECTED_RISK, SELECTED_BU, factor.label, factor.init);
		// Update slider output
		output.innerHTML = parseFloat(factor.init).toLocaleString();
	})
	updateView();
	// Don't refresh the page
	return false;
}

const resetControlValues = () => {
	getControlData(SELECTED_RISK,SELECTED_BU).forEach( factor => {
		checkbox = document.getElementById(factor.checkbox_id);
		checkbox.checked = false;
		setControlValue(SELECTED_RISK, SELECTED_BU, factor.label, factor.init);
	})
	updateView();
	// Don't refresh the page
	return false;
}

const getProportionTooltip = (label, is_control) => {
	if(is_control) {
		control = getControlData(SELECTED_RISK,SELECTED_BU).find(elem => elem.label == label);
		tooltip = `<span><b>Current:</b> ${control.init.toLocaleString()}</span><br>
			<span><b>Last Month:</b> ${control.last_month.toLocaleString()}</span><br>
			<span><b>Last Year:</b> ${control.last_year.toLocaleString()}</span><br>
			<span><b>Predicted:</b> ${control.predicted.toLocaleString()}</span><br>
			<span><b>What If:</b> ${control.current.toLocaleString()}</span><br>`;
	} else {
		irf = getIRFData(SELECTED_RISK, SELECTED_BU).find(elem => elem.label == label);
		tooltip = `<span><b>Current:</b> ${irf.init.toLocaleString()}</span><br>
			<span><b>Last Month:</b> ${irf.last_month.toLocaleString()}</span><br>
			<span><b>Last Year:</b> ${irf.last_year.toLocaleString()}</span><br>
			<span><b>Predicted:</b> ${irf.predicted.toLocaleString()}</span><br>
			<span><b>What If:</b> ${irf.current.toLocaleString()}</span><br>`;
	}
	return tooltip;
}

const getSquareTooltip = (severity, likelihood) => {
	severity = `£${Math.round(severity).toLocaleString()}`;
	likelihood = `Every ${likelihood.toFixed(2)} quarters`;
	tooltip = `<span>${severity}</span><br><span>${likelihood}</span>`;
	return tooltip;
}
