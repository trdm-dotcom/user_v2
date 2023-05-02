import { JsonIgnoreProperties, JsonProperty } from 'jackson-js';

@JsonIgnoreProperties({})
export default class GoogleResponse {
  @JsonProperty()
  private id: string;

  @JsonProperty()
  private email: string;

  @JsonProperty()
  private name: string;

  @JsonProperty()
  private givenName: string;

  @JsonProperty()
  private familyName: string;

  @JsonProperty()
  private profileUrl: string;

  public setProfileUrl(profileUrl: string) {
    this.profileUrl = profileUrl;
  }

  public getId() {
    return this.id;
  }

  public getEmail() {
    return this.email;
  }

  public getProfileUrl() {
    return this.profileUrl;
  }

  public getName() {
    return this.name;
  }

  public getGivenName() {
    return this.givenName;
  }

  public getFamilyName() {
    return this.familyName;
  }
}
