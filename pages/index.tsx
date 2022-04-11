import { GeoJsonLayer } from "@deck.gl/layers";
import DeckGL from "@deck.gl/react";
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Slider,
  TextField,
  Typography,
} from "@mui/material";
import {
  DrawPolygonByDraggingMode,
  DrawPolygonMode,
} from "@nebula.gl/edit-modes";
import { EditableGeoJsonLayer } from "@nebula.gl/layers";
import { EditableGeojsonLayerProps } from "@nebula.gl/layers/dist-types/layers/editable-geojson-layer";
import {
  booleanPointInPolygon,
  Feature,
  FeatureCollection,
  lineDistance,
  Point,
  Polygon,
} from "@turf/turf";
import { ParentSize } from "@visx/responsive";
import { GetServerSideProps } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import StaticMap from "react-map-gl";
import BrushChart from "../components/speed_chart";
import { stravaClient, SummaryActivity } from "../strava_client";

type Points = FeatureCollection<Point, { time: number; moving: boolean }>;

export default function Home(props: Props) {
  const [smoother, setSmoother] = useState<number>(50);
  const [activities, setActivities] = useState<SummaryActivity[]>([]);
  const [selectedFeatureIndexes, setSelectedFeatureIndexes] = useState([]);
  const [isLasso, setIsLasso] = useState(false);
  const [features, setFeatures] = useState<Points>({
    type: "FeatureCollection",
    features: [],
  });
  useEffect(() => {
    if (props.access_token) {
      localStorage.props = JSON.stringify(props);
    }
    const access_token =
      props?.access_token ||
      (localStorage.props && JSON.parse(localStorage.props).access_token);
    if (access_token) {
      stravaClient()
        .activities.getLoggedInAthleteActivities()
        .then(({ data }) => setActivities(data));
    }
  }, [props]);
  const handleKeyPress = useCallback(
    (event) => {
      if (event.key === "Backspace") {
        setFeatures({
          type: "FeatureCollection",
          features: features.features.filter(
            (x, i) => selectedFeatureIndexes.indexOf(i) === -1
          ),
        });
        setSelectedFeatureIndexes([]);
        setIsLasso(false);
      }
      // space bar
      if (event.key === "x") {
        setIsLasso(!isLasso);
      }
      // escape
      if (event.keyCode === 27) {
        setSelectedFeatureIndexes([]);
        setIsLasso(false);
      }
    },
    [features.features, selectedFeatureIndexes, isLasso]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyPress);
    return () => document.removeEventListener("keydown", handleKeyPress);
  }, [handleKeyPress]);
  const layer: EditableGeoJsonLayer = new (EditableGeoJsonLayer as any)({
    id: "geojson",
    data: features,
    mode: isLasso ? DrawPolygonByDraggingMode : DrawPolygonMode,
    selectedFeatureIndexes,
    getRadius: (d) =>
      selectedFeatureIndexes.includes(features.features.indexOf(d)) ? 10 : 1,
    getFillColor: (d) =>
      selectedFeatureIndexes.includes(features.features.indexOf(d))
        ? [255, 255, 255, 255]
        : [0, 0, 0, 255],
    getLineColor: (d) =>
      !selectedFeatureIndexes.includes(features.features.indexOf(d))
        ? [255, 0, 0, 255]
        : [0, 255, 0, 255],
    onEdit: ({ updatedData }) => {
      if (updatedData?.features?.at(-1)?.geometry?.type !== "Polygon") {
        return;
      }
      const polygon: Polygon = updatedData?.features?.at(-1);
      setSelectedFeatureIndexes(
        features.features
          .map((x, i) => ({ x, i }))
          .filter(({ x, i }) => booleanPointInPolygon(x, polygon))
          .map(({ x, i }) => i)
      );
    },
  } as EditableGeojsonLayerProps<any>);
  const lineString: Feature = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: features.features.map((f) => f.geometry.coordinates),
    },
  };
  const tripDistanceKilometers = lineDistance(lineString, {
    units: "kilometers",
  });
  const tripSeconds =
    features.features.length > 0
      ? features.features.at(-1).properties.time -
        features.features.at(0).properties.time
      : 0;
  const autocompleteOptions = activities.map((a) => ({
    label: `${a.name} ${
      (a.start_date as unknown as string).split("T")[0]
    } ${Math.round(a.distance / 1000.0)}km ${a.id}`,
    id: a.id,
  }));
  return (
    <Grid container spacing={2}>
      <Grid item xs={2}>
        <Link
          href={[
            new URL("https://www.strava.com/oauth/mobile/authorize").toString(),
            new URLSearchParams({
              client_id: process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID,
              response_type: "code",
              redirect_uri: `${process.env.NEXT_PUBLIC_HOST}`,
              scope: "activity:read_all",
              approval_prompt: "auto",
            }).toString(),
          ].join("?")}
          passHref={true}
        >
          <Button variant="contained">Log in to Strava</Button>
        </Link>
      </Grid>
      <Grid item xs={3}>
        <Autocomplete
          isOptionEqualToValue={(option, value) => value.id === option.id}
          disablePortal
          id="combo-box-demo"
          options={autocompleteOptions}
          sx={{ width: 300 }}
          renderInput={(params) => <TextField {...params} label="Activity" />}
          onChange={async (event, value) => {
            const activity_id = typeof value !== "string" && value?.id;
            if (!activity_id) {
              return;
            }
            const streamSet = (
              await stravaClient().streams.getActivityStreams(
                activity_id,
                ["time", "latlng", "moving"],
                true
              )
            ).data;
            const points = [];
            let time = streamSet.time.data[0];
            for (let i = 1; i < streamSet.time.data.length; i++) {
              points.push({
                latlng: [
                  streamSet.latlng.data[i][0],
                  streamSet.latlng.data[i][1],
                ],
                time,
                moving: streamSet.moving.data[i],
              });
              if (streamSet.moving.data[i]) {
                time += streamSet.time.data[i] - streamSet.time.data[i - 1];
              }
            }
            setFeatures({
              type: "FeatureCollection",
              features: points.map((x) => ({
                type: "Feature",
                properties: { time: x.time, moving: x.moving },
                geometry: {
                  type: "Point",
                  coordinates: [x.latlng[1], x.latlng[0]],
                },
              })),
            });
          }}
        />
      </Grid>
      <Grid item xs={3}>
        <Box sx={{ width: 320 }}>
          <Typography gutterBottom>Smoothness</Typography>
          <Slider
            value={smoother}
            valueLabelDisplay="auto"
            onChange={(event, value) => setSmoother(value as number)}
            step={10}
            marks
            min={0}
            max={200}
          />
        </Box>
      </Grid>
      <Grid item xs={4}>
        {features.features.length > 0 ? (
          <div style={{ padding: 2 }}>
            <div>
              {Math.floor(tripSeconds / 60 / tripDistanceKilometers)}:
              {Math.round(
                ((tripSeconds / tripDistanceKilometers / 60) % 1) * 60
              )}{" "}
              min/km
            </div>
            <div>{Math.round(tripDistanceKilometers * 10) / 10} KM</div>
            <div>{Math.round(tripSeconds / 60)} minutes</div>
          </div>
        ) : undefined}
      </Grid>
      <Grid item xs={6}>
        <Card sx={{ height: "70vh" }}>
          <CardContent>
            <div style={{ position: "relative", height: "67vh" }}>
              <DeckGL
                controller={true}
                initialViewState={{
                  latitude: 48.85,
                  longitude: 2.3,
                  zoom: 12,
                }}
                getCursor={layer.getCursor.bind(layer)}
                layers={[
                  new GeoJsonLayer({
                    id: "geojson-layer",
                    data: lineString,
                    stroked: false,
                    lineWidthMinPixels: 2,
                    getLineColor: [200, 10, 10],
                    opacity: 0.5,
                  }),
                  layer,
                ]}
              >
                <StaticMap
                  mapStyle="mapbox://styles/mapbox/light-v10"
                  mapboxAccessToken={
                    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
                  }
                />
              </DeckGL>
            </div>
          </CardContent>
        </Card>
      </Grid>
      {features.features.length > 0 ? (
        <Grid item xs={6}>
          <Card>
            <CardContent>
              <div style={{ height: 600, paddingBottom: 10 }}>
                <ParentSize>
                  {(parent) => (
                    <BrushChart
                      onChange={(a, b) => {
                        setSelectedFeatureIndexes(
                          features.features
                            .map((x, i) => ({ x, i }))
                            .filter(({ x }) => {
                              return (
                                x.properties.time >= a && x.properties.time <= b
                              );
                            })
                            .map(({ i }) => i)
                        );
                      }}
                      data={features.features
                        .slice(smoother + 1)
                        .map((f, i) => ({
                          time:
                            (f.properties.time +
                              features.features[i].properties.time) *
                            0.5,
                          speed:
                            (f.properties.time -
                              features.features[i].properties.time) /
                            60 /
                            lineDistance(
                              {
                                type: "Feature",
                                properties: {},
                                geometry: {
                                  type: "LineString",
                                  coordinates: features.features
                                    .slice(i, i + smoother + 2)
                                    .map((f) => f.geometry.coordinates),
                                },
                              },
                              { units: "kilometers" }
                            ),
                        }))
                        .filter(({ speed }) => speed > 2.5 && speed < 7)}
                      height={parent.height}
                      width={parent.width}
                    />
                  )}
                </ParentSize>
              </div>
            </CardContent>
          </Card>
        </Grid>
      ) : undefined}
    </Grid>
  );
}

interface Props {
  token_type: "Bearer";
  refresh_token: string;
  access_token: string;
  athlete: {
    id: number;
    username?: string;
    firstname: string;
    lastname: string;
    profile_medium: string;
    profile: string;
  };
}

export const getServerSideProps: GetServerSideProps = async ({
  query: { code, refresh_token },
}) => {
  if (code) {
    return {
      props: await (
        await fetch("https://www.strava.com/api/v3/oauth/token", {
          method: "POST",
          body: new URLSearchParams({
            code,
            client_id: process.env.STRAVA_CLIENT_ID,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            grant_type: "authorization_code",
          } as Record<string, string>).toString(),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        })
      ).json(),
    };
  }
  if (refresh_token) {
    return {
      props: await (
        await fetch("https://www.strava.com/api/v3/oauth/token", {
          method: "POST",
          body: new URLSearchParams({
            refresh_token,
            client_id: process.env.STRAVA_CLIENT_ID,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            grant_type: "refresh_token",
          } as Record<string, string>).toString(),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        })
      ).json(),
    };
  }
  return {
    props: {},
  };
};
